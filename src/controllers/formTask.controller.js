import FormTask from "../models/FormTask.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import Form from "../models/Form.model.js";
import FormTemplate from "../models/FormTemplate.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import { sendApprovalEmail, sendSubmissionNotificationToApprover } from "../services/email.service.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import fs from "fs";

export const getAssignedTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const tasks = await FormTask.find({
      assignedTo: userId,
      status: "pending"
    })
    .populate("formId", "formName formId fields sections")
    .populate("assignedBy", "name email")
    .sort({ createdAt: -1 });

    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Get assigned tasks error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch assigned tasks" });
  }
};

export const getTaskStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const pendingCount = await FormTask.countDocuments({
      assignedTo: userId,
      status: "pending"
    });

    const completedCount = await FormTask.countDocuments({
      assignedTo: userId,
      status: "completed"
    });

    res.json({ 
      success: true, 
      data: { pendingCount, completedCount } 
    });
  } catch (error) {
    console.error("Get task stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch task stats" });
  }
};

export const submitTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { data } = req.body;
    const userId = req.user.userId;

    // Process files if any
    const files = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Check if file path exists
          if (!file.path) {
            console.error("File path missing for:", file.fieldname);
            continue;
          }
          
          const result = await uploadToCloudinary(fs.readFileSync(file.path), 'submissions');
          files.push({
            fieldId: file.fieldname,
            filename: file.filename,
            originalName: file.originalname,
            url: result.secure_url,
            mimetype: file.mimetype,
            size: file.size
          });
          // Update data with file URL
          if (typeof data === 'string') {
            const parsedData = JSON.parse(data);
            parsedData[file.fieldname] = result.secure_url;
            data = JSON.stringify(parsedData);
          } else {
            data[file.fieldname] = result.secure_url;
          }
          
          // Only try to delete if path exists
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error("File upload error:", file.originalname, uploadError);
          // Try to clean up file if it exists
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
    }

    const task = await FormTask.findById(taskId).populate({
      path: "formId",
      select: "formName formId fields sections approvalFlow workflow companyId plantId"
    });
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You are not authorized to submit this task" });
    }

    if (task.status === "completed") {
      return res.status(400).json({ success: false, message: "This task has already been completed" });
    }

    const form = task.formId;
    if (!form) {
      return res.status(404).json({ success: false, message: "Form definition not found for this task" });
    }

    // Debug: Log form fields to verify they're loaded
    console.log('Task form fields loaded:', form.fields?.length || 0);
    console.log('Task sample field with includeInApprovalEmail:', form.fields?.[0]?.includeInApprovalEmail);

    const hasFlow = form?.approvalFlow && form.approvalFlow.length > 0;
    const finalStatus = hasFlow ? "PENDING_APPROVAL" : "APPROVED";

    const submissionData = {
      formId: form._id,
      plantId: task.plantId || req.user.plantId,
      companyId: task.companyId || req.user.companyId,
      submittedBy: userId.toString(),
      data: typeof data === 'string' ? JSON.parse(data) : data,
      files: files,
      status: finalStatus,
      currentLevel: finalStatus === "PENDING_APPROVAL" ? 1 : 0,
      submittedAt: new Date()
    };

    const submission = await FormSubmission.create(submissionData);

    // Notify first approver if sequential approval is required with filtered fields (non-blocking)
    if (finalStatus === "PENDING_APPROVAL") {
      setImmediate(async () => {
        try {
          const firstLevel = form.approvalFlow.find(f => f.level === 1);
          if (firstLevel) {
            const approver = await User.findById(firstLevel.approverId);
            const company = await Company.findById(submissionData.companyId);
            const plant = await Plant.findById(submissionData.plantId);
            
            if (approver && approver.email) {
              const approvalLink = `${process.env.FRONTEND_URL}/approval/${submission._id}`;
              await sendSubmissionNotificationToApprover(
                approver.email,
                form.formName,
                req.user.name || "Employee",
                submissionData.submittedAt,
                approvalLink,
                [], // previous approvals
                company,
                plant,
                plant?._id?.toString() || req.user.plantId?.toString() || "",
                form.formId || form._id?.toString() || "",
                submission._id?.toString() || "",
                form.fields || [], // form fields for filtering
                submissionData.data || {}, // submission data
                "PLANT_ADMIN",
                submissionData.companyId,
                req.user.email || null // submitter email
              );
            }
          }
        } catch (emailError) {
          console.error("Failed to notify first approver:", emailError);
        }
      });
    }

    task.status = "completed";
    task.completedAt = new Date();
    task.submissionId = submission._id;
    await task.save();

    res.json({ 
      success: true, 
      message: "Form submitted successfully", 
      submission 
    });
  } catch (error) {
    console.error("Submit task error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to submit form",
      error: error.message,
      details: error.errors // Include mongoose validation errors if any
    });
  }
};

export const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;

    const task = await FormTask.findById(taskId)
      .populate("formId", "formName formId fields sections approvalFlow")
      .populate("assignedBy", "name email");

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    if (task.assignedTo.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You are not authorized to view this task" });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error("Get task by id error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch task" });
  }
};

export const createTasks = async (req, res) => {
  try {
    const { formIds, assignedTo, dueDate } = req.body;
    const { userId, plantId, companyId } = req.user;

    if (!formIds || !Array.isArray(formIds) || formIds.length === 0) {
      return res.status(400).json({ success: false, message: "At least one form is required" });
    }

    if (!assignedTo) {
      return res.status(400).json({ success: false, message: "Employee assignment is required" });
    }

    const tasks = await Promise.all(
      formIds.map(async (formId) => {
        return await FormTask.create({
          formId,
          assignedTo,
          assignedBy: userId,
          plantId,
          companyId,
          dueDate,
          status: "pending"
        });
      })
    );

    // Optional: Send notification to employee
    try {
      const employee = await User.findById(assignedTo);
      const forms = await Form.find({ _id: { $in: formIds } });
      const company = await Company.findById(companyId);
      const plant = await Plant.findById(plantId);
      
      if (employee && employee.email) {
        const formNames = forms.map(f => f.formName).join(", ");
        const dashboardLink = `${process.env.FRONTEND_URL}/employee/dashboard`;
        await sendApprovalEmail(employee.email, `New Assigned Forms: ${formNames}`, dashboardLink, company, plant);
      }
    } catch (emailError) {
      console.error("Failed to notify employee of new tasks:", emailError);
    }

    res.status(201).json({ 
      success: true, 
      message: `${tasks.length} task(s) assigned successfully`, 
      tasks 
    });
  } catch (error) {
    console.error("Create tasks error:", error);
    res.status(500).json({ success: false, message: "Failed to assign forms" });
  }
};

export const submitFormDirectly = async (req, res) => {
  try {
    const { formId } = req.params;
    const userId = req.user.userId;

    // Fetch full user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // First, try to find in Form model
    let form = await Form.findById(formId).select("formName formId fields sections approvalFlow status companyId plantId workflow");
    
    if (!form) {
      // If not found in Form model, try FormTemplate model
      form = await FormTemplate.findById(formId).select("templateName formId fields sections workflow status companyId plantId");
    }

    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    // Debug: Log form fields to verify they're loaded
    console.log('Form fields loaded:', form.fields?.length || 0);
    console.log('Sample field with includeInApprovalEmail:', form.fields?.[0]?.includeInApprovalEmail);

    // Check if form has proper status (using either status field)
    const formStatus = form.status || form.formStatus;
    if (formStatus !== "APPROVED" && formStatus !== "PUBLISHED") {
      return res.status(400).json({ success: false, message: "This form is not yet published and available for submission" });
    }

    // Parse form data from request
    let data;
    if (req.body.data) {
      // If data is sent as JSON string in form field
      data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    } else {
      // If data is sent directly in request body
      data = req.body;
    }

    // Process files if any
    const files = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Check if file path exists
          if (!file.path) {
            console.error("File path missing for:", file.fieldname);
            continue;
          }
          
          const result = await uploadToCloudinary(fs.readFileSync(file.path), 'submissions');
          files.push({
            fieldId: file.fieldname,
            filename: file.filename,
            originalName: file.originalname,
            url: result.secure_url,
            mimetype: file.mimetype,
            size: file.size
          });
          data[file.fieldname] = result.secure_url;
          
          // Only try to delete if path exists
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error("File upload error:", file.originalname, uploadError);
          // Try to clean up file if it exists
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
    }

    // Determine workflow/approval flow depending on form type
    const workflow = form.workflow || form.approvalFlow || [];
    const hasFlow = workflow && workflow.length > 0;
    const finalStatus = hasFlow ? "PENDING_APPROVAL" : "APPROVED";

    const submissionData = {
      formId: form._id,
      formName: form.formName || form.templateName || "Untitled Form", // Use appropriate name field
      plantId: form.plantId || user.plantId,
      companyId: form.companyId || user.companyId,
      submittedBy: userId,
      submittedByName: user.name || "",
      submittedByEmail: user.email || "",
      data: data,
      files: files,
      status: finalStatus,
      currentLevel: finalStatus === "PENDING_APPROVAL" ? 1 : 0,
      submittedAt: new Date()
    };

    const submission = await FormSubmission.create(submissionData);

    // Create FormTask entries for approvers if there's an approval workflow
    if (hasFlow && finalStatus === "PENDING_APPROVAL") {
      try {
        const formTasks = [];
        
        // Create a task for each approver in the workflow
        for (const approvalLevel of workflow) {
          const formTask = await FormTask.create({
            formId: form._id,
            assignedTo: approvalLevel.approverId,
            assignedBy: userId, // The person who submitted the form
            plantId: submissionData.plantId,
            companyId: submissionData.companyId,
            status: "pending"
          });
          formTasks.push(formTask);
        }

        // Notify all approvers with filtered field data (non-blocking)
        setImmediate(async () => {
          for (const approvalLevel of workflow) {
            try {
              const approver = await User.findById(approvalLevel.approverId);
              const company = await Company.findById(submissionData.companyId);
              const plant = await Plant.findById(submissionData.plantId);
              
              if (approver && approver.email) {
                const approvalLink = `${process.env.FRONTEND_URL}/employee/approval/pending`;
                await sendSubmissionNotificationToApprover(
                  approver.email,
                  submissionData.formName,
                  submissionData.submittedByName,
                  submissionData.submittedAt,
                  approvalLink,
                  [], // previous approvals (empty for first submission)
                  company,
                  plant,
                  plant?._id?.toString() || submissionData.plantId?.toString() || "",
                  form.formId || form._id?.toString() || "",
                  submission._id?.toString() || "",
                  form.fields || [], // form fields for filtering
                  submissionData.data || {}, // submission data
                  "PLANT_ADMIN",
                  submissionData.companyId,
                  submissionData.submittedByEmail || null // submitter email
                );
              }
            } catch (emailError) {
              console.error(`Failed to notify approver ${approvalLevel.approverId}:`, emailError);
            }
          }
        });
      } catch (taskError) {
        console.error("Failed to create approval tasks:", taskError);
        // Don't fail the submission if task creation fails, but log the error
      }
    }

    res.json({ 
      success: true, 
      message: "Form submitted successfully", 
      submission 
    });
  } catch (error) {
    console.error("Submit form directly error:", error);
    res.status(500).json({ success: false, message: "Failed to submit form" });
  }
};

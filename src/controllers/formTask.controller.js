import FormTask from "../models/FormTask.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import Form from "../models/Form.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import { sendApprovalEmail } from "../services/email.service.js";

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

    const task = await FormTask.findById(taskId).populate("formId");
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

    const hasFlow = form?.approvalFlow && form.approvalFlow.length > 0;
    const finalStatus = hasFlow ? "PENDING_APPROVAL" : "APPROVED";

    const submissionData = {
      formId: form._id,
      plantId: task.plantId || req.user.plantId,
      companyId: task.companyId || req.user.companyId,
      submittedBy: userId.toString(),
      data: typeof data === 'string' ? JSON.parse(data) : data,
      status: finalStatus,
      currentLevel: finalStatus === "PENDING_APPROVAL" ? 1 : 0,
      submittedAt: new Date()
    };

    const submission = await FormSubmission.create(submissionData);

    // Notify first approver if sequential approval is required
    if (finalStatus === "PENDING_APPROVAL") {
      try {
        const firstLevel = form.approvalFlow.find(f => f.level === 1);
        if (firstLevel) {
          const approver = await User.findById(firstLevel.approverId);
          const company = await Company.findById(submissionData.companyId);
          const plant = await Plant.findById(submissionData.plantId);
          
          if (approver && approver.email) {
            const approvalLink = `${process.env.FRONTEND_URL}/approval/${submission._id}`;
            await sendApprovalEmail(approver.email, form.formName, approvalLink, company, plant);
          }
        }
      } catch (emailError) {
        console.error("Failed to notify first approver:", emailError);
      }
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
    const { data } = req.body;
    const userId = req.user.userId;

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    if (form.status !== "APPROVED" && form.status !== "PUBLISHED") {
      return res.status(400).json({ success: false, message: "This form is not yet published and available for submission" });
    }

    const hasFlow = form?.approvalFlow && form.approvalFlow.length > 0;
    const finalStatus = hasFlow ? "PENDING_APPROVAL" : "APPROVED";

    const submissionData = {
      formId: form._id,
      plantId: form.plantId || req.user.plantId,
      companyId: form.companyId || req.user.companyId,
      submittedBy: userId,
      data: typeof data === 'string' ? JSON.parse(data) : data,
      status: finalStatus,
      currentLevel: finalStatus === "PENDING_APPROVAL" ? 1 : 0,
      submittedAt: new Date()
    };

    const submission = await FormSubmission.create(submissionData);

    // Notify first approver
    if (finalStatus === "PENDING_APPROVAL") {
      try {
        const firstLevel = form.approvalFlow.find(f => f.level === 1);
        if (firstLevel) {
          const approver = await User.findById(firstLevel.approverId);
          const company = await Company.findById(submissionData.companyId);
          const plant = await Plant.findById(submissionData.plantId);
          
          if (approver && approver.email) {
            const approvalLink = `${process.env.FRONTEND_URL}/approval/detail/${submission._id}`;
            await sendApprovalEmail(approver.email, form.formName, approvalLink, company, plant);
          }
        }
      } catch (emailError) {
        console.error("Failed to notify first approver:", emailError);
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

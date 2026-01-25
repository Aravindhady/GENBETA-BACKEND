import ApprovalLink from "../models/ApprovalLink.model.js";
import ApprovalTask from "../models/ApprovalTask.model.js";
import Form from "../models/Form.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import { 
  sendApprovalEmail, 
  sendSubmissionNotificationToApprover, 
  sendFinalApprovalNotificationToSubmitter,
  sendApprovalStatusNotificationToPlant,
  sendRejectionNotificationToSubmitter
} from "../services/email.service.js";
import crypto from "crypto";

/* ======================================================
   APPROVAL TASK (INTERNAL WORKFLOW)
====================================================== */

export const createApprovalTask = async (req, res) => {
  try {
    const { formIds, approverId, dueDate } = req.body;
    const { userId, plantId, companyId } = req.user;

    if (!formIds || formIds.length === 0) {
      return res.status(400).json({ message: "At least one form is required" });
    }

    const task = await ApprovalTask.create({
      approverId,
      formIds,
      plantId,
      companyId,
      submittedBy: userId,
      dueDate,
      status: "PENDING"
    });

    // Notify approver
    try {
      const approver = await User.findById(approverId);
      const forms = await Form.find({ _id: { $in: formIds } });
      const company = await Company.findById(companyId);
      const plant = await Plant.findById(plantId);
      
      if (approver && approver.email) {
        const formNames = forms.map(f => f.formName).join(", ");
        const taskLink = `${process.env.FRONTEND_URL}/employee/tasks`; // Link to their task list
        await sendApprovalEmail(approver.email, formNames, taskLink, company, plant);
      }
    } catch (emailError) {
      console.error("Failed to notify approver of new task:", emailError);
    }

    // Update form statuses to IN_APPROVAL
    await Form.updateMany(
      { _id: { $in: formIds } },
      { 
        $set: { 
          status: "IN_APPROVAL",
          approvalTaskId: task._id 
        } 
      }
    );

    res.status(201).json({ success: true, message: "Approval task created successfully", task });
  } catch (error) {
    console.error("Create approval task error:", error);
    res.status(500).json({ message: "Failed to create approval task" });
  }
};

export const getApprovalTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;

    const query = { approverId: userId };
    if (status) query.status = status;

    const tasks = await ApprovalTask.find(query)
      .populate("formIds", "formName description")
      .populate("submittedBy", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error("Get approval tasks error:", error);
    res.status(500).json({ message: "Failed to fetch approval tasks" });
  }
};

export const getApprovalTaskDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await ApprovalTask.findById(id)
      .populate("formIds")
      .populate("submittedBy", "name")
      .populate("completedForms");

    if (!task) return res.status(404).json({ message: "Approval task not found" });

    res.json(task);
  } catch (error) {
    console.error("Get approval task details error:", error);
    res.status(500).json({ message: "Failed to fetch task details" });
  }
};

export const sendLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { approverEmail } = req.body;

    const form = await Form.findById(id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    await ApprovalLink.create({
      formIds: [form._id],
      plantId: form.plantId,
      token,
      approverEmail,
      expiresAt
    });

    const approvalLink = `${process.env.FRONTEND_URL}/approve/${token}`;
    
    // Fetch company and plant details
    const company = await Company.findById(form.companyId);
    const plant = await Plant.findById(form.plantId);
    
    await sendApprovalEmail(approverEmail, form.formName, approvalLink, company, plant);

    res.json({ message: "Approval link sent successfully" });
  } catch (error) {
    console.error("Send link error:", error);
    res.status(500).json({ message: "Failed to send link" });
  }
};

export const sendMultiFormLink = async (req, res) => {
  try {
    const { formIds, approverEmail } = req.body;

    if (!formIds || formIds.length === 0) {
      return res.status(400).json({ message: "At least one form is required" });
    }

    const forms = await Form.find({ _id: { $in: formIds } });
    if (forms.length !== formIds.length) {
      return res.status(404).json({ message: "One or more forms not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    await ApprovalLink.create({
      formIds: formIds,
      plantId: forms[0].plantId,
      token,
      approverEmail,
      expiresAt
    });

    const approvalLink = `${process.env.FRONTEND_URL}/approve/${token}`;
    const formNames = forms.map(f => f.formName).join(", ");
    
    // Fetch company and plant details (using the first form's details)
    const company = await Company.findById(forms[0].companyId);
    const plant = await Plant.findById(forms[0].plantId);
    
    await sendApprovalEmail(approverEmail, `${forms.length} Forms: ${formNames}`, approvalLink, company, plant);

    res.json({ message: "Approval link sent successfully for multiple forms" });
  } catch (error) {
    console.error("Send multi-form link error:", error);
    res.status(500).json({ message: "Failed to send link" });
  }
};

export const getFormByToken = async (req, res) => {
  try {
    const { token } = req.params;

    const link = await ApprovalLink.findOne({ token, isUsed: false });
    if (!link) return res.status(404).json({ message: "Invalid or used link" });

    if (new Date() > link.expiresAt) {
      return res.status(410).json({ message: "Link has expired" });
    }

    const forms = await Form.find({ _id: { $in: link.formIds } }).select("-companyId -createdBy");
    if (forms.length === 0) return res.status(404).json({ message: "Forms no longer exist" });

    res.json({
      forms,
      completedForms: link.completedForms || [],
      approverEmail: link.approverEmail,
      isMultiForm: forms.length > 1
    });
  } catch (error) {
    console.error("Get form by token error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const submitFormByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const { formId, data } = req.body;

    const link = await ApprovalLink.findOne({ token, isUsed: false });
    if (!link) return res.status(404).json({ message: "Invalid or used link" });

    if (new Date() > link.expiresAt) {
      return res.status(410).json({ message: "Link has expired" });
    }

    if (!link.formIds.map(id => id.toString()).includes(formId)) {
      return res.status(400).json({ message: "Form not part of this approval link" });
    }

    if (link.completedForms && link.completedForms.map(id => id.toString()).includes(formId)) {
      return res.status(400).json({ message: "This form has already been submitted" });
    }

    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ message: "Form not found" });

    await FormSubmission.create({
      templateId: form._id,
      templateModel: 'Form',
      templateName: form.formName,
      plantId: form.plantId,
      companyId: form.companyId,
      submittedBy: link.approverEmail,
      data,
      status: "SUBMITTED"
    });

    link.completedForms = link.completedForms || [];
    link.completedForms.push(formId);

    if (link.completedForms.length === link.formIds.length) {
      link.isUsed = true;
    }

    await link.save();

    res.json({ 
      message: "Form submitted successfully",
      allFormsCompleted: link.completedForms.length === link.formIds.length,
      completedCount: link.completedForms.length,
      totalForms: link.formIds.length
    });
  } catch (error) {
    console.error("Submit form by token error:", error);
    res.status(500).json({ message: "Failed to submit form" });
  }
};

/* ======================================================
   EMPLOYEE APPROVAL WORKFLOW
====================================================== */

// Get submissions where current user is part of the approval flow
export const getAssignedSubmissions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { plantId, companyId } = req.user;

    // Find forms where this user is an approver at any level
    const formsWithUserAsApprover = await Form.find({
      "approvalFlow.approverId": userId
    });

    const formIds = formsWithUserAsApprover.map(f => f._id);

    // Also get forms from user's plant that have no approval flow (they can approve directly)
    const formsWithoutFlow = await Form.find({
      plantId,
      $or: [
        { approvalFlow: { $exists: false } },
        { approvalFlow: { $size: 0 } }
      ]
    });
    
    const allFormIds = [...formIds, ...formsWithoutFlow.map(f => f._id)];

    // Find submissions for these forms that are currently in progress
    const submissions = await FormSubmission.find({
      templateId: { $in: allFormIds },
      status: { $in: ["PENDING_APPROVAL", "IN_PROGRESS", "in_progress", "SUBMITTED"] }
    })
    .populate("templateId", "formName approvalFlow")
    .populate("submittedBy", "name email")
    .populate({
      path: "templateId",
      populate: {
        path: "approvalFlow.approverId",
        select: "name email"
      }
    })
    .sort({ createdAt: -1 });

    // Enhance submissions with "isMyTurn" and "pendingApprover" info
    const enhancedSubmissions = submissions.map(sub => {
      const subObj = sub.toObject();
      const template = sub.templateId;
      const flow = template?.approvalFlow || [];
      
      // If no approval flow, it's always the user's turn
      if (flow.length === 0) {
        return {
          ...subObj,
          isMyTurn: true,
          userLevel: 1,
          pendingApproverName: null
        };
      }
      
      // Find the level assigned to the current user
      const userLevelEntry = flow.find(f => 
        f.approverId?._id?.toString() === userId.toString() || 
        f.approverId?.toString() === userId.toString()
      );
      const userLevel = userLevelEntry?.level;
      
      // Determine if it's the user's turn
      const isMyTurn = sub.currentLevel === userLevel;
      
      // Get the name of the person who needs to approve before this user
      let pendingApproverName = null;
      if (!isMyTurn && userLevel && sub.currentLevel < userLevel) {
        const currentLevelApprover = flow.find(f => f.level === sub.currentLevel);
        pendingApproverName = currentLevelApprover?.approverId?.name || "Previous Approver";
      }

      return {
        ...subObj,
        isMyTurn,
        userLevel,
        pendingApproverName
      };
    });

    res.json(enhancedSubmissions);
  } catch (error) {
    console.error("Get assigned submissions error:", error);
    res.status(500).json({ message: "Failed to fetch assigned submissions" });
  }
};

// Approve or Reject a submission
export const processApproval = async (req, res) => {
  try {
    const { submissionId, status, comments, data } = req.body;
    const userId = req.user.userId;

    const submission = await FormSubmission.findById(submissionId).populate({
      path: "templateId",
      populate: {
        path: "approvalFlow.approverId",
        select: "name email"
      }
    });
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const form = submission.templateId;
    const flow = form?.approvalFlow || [];
    
    // For forms with no approval flow, allow any authorized user to approve
    if (flow.length === 0) {
      // No approval flow defined - allow the action
    } else {
      // Verify user is the correct approver for current level
      const currentApprover = flow.find(f => f.level === submission.currentLevel);
      if (!currentApprover) {
        return res.status(403).json({ message: "No approver found for this level" });
      }
      
      // Handle both populated and unpopulated approverId
      const approverId = currentApprover.approverId?._id?.toString() || currentApprover.approverId?.toString();
      if (approverId !== userId.toString()) {
        return res.status(403).json({ message: "You are not the authorized approver for this level" });
      }
    }

    // If data is provided (approver edited the form), update it
    if (data) {
      submission.data = data;
      submission.markModified('data');
    }

    // Update history
    submission.approvalHistory.push({
      level: submission.currentLevel,
      approverId: userId,
      status: status.toUpperCase(),
      comments,
      actionedAt: new Date()
    });

    if (status.toLowerCase() === "rejected") {
        submission.status = "REJECTED";
        submission.rejectedAt = new Date();
        submission.rejectedBy = userId;

        // Notify submitter of rejection with comments
        (async () => {
          try {
            const submitter = await User.findById(submission.submittedBy);
            const rejector = await User.findById(userId);
            const company = await Company.findById(submission.companyId);
            const plant = await Plant.findById(submission.plantId);

            if (submitter && submitter.email && comments) {
              const viewLink = `${process.env.FRONTEND_URL}/employee/submissions/${submission._id}`;
              const plantId = plant?.plantNumber || plant?._id?.toString() || submission.plantId?.toString() || "";
              const formId = (form?.numericalId || submission.formNumericalId)?.toString() || form?.formId || form?._id?.toString() || "";
              const submissionId = submission.numericalId?.toString() || submission._id?.toString() || "";
              
              await sendRejectionNotificationToSubmitter(
                submitter.email,
                form.formName || form.templateName,
                rejector?.name || "An approver",
                comments,
                viewLink,
                company,
                plant,
                plantId,
                formId,
                submissionId
              );
            }
          } catch (emailErr) {
            console.error("Failed to send rejection notification:", emailErr);
          }
        })();
      } else {
      // If approved, check if there are more levels
      const nextLevel = submission.currentLevel + 1;
      const nextLevelEntry = flow.find(f => f.level === nextLevel);

      if (nextLevelEntry) {
          submission.currentLevel = nextLevel;
          submission.status = "PENDING_APPROVAL"; // Keep it pending for the next person
          
          // Notify next approver
          try {
            const nextApproverId = nextLevelEntry.approverId?._id || nextLevelEntry.approverId;
            const nextApprover = await User.findById(nextApproverId);
            const submitter = await User.findById(submission.submittedBy);
            const currentApprover = await User.findById(userId);
            
            // Fetch company and plant details
            const company = await Company.findById(submission.companyId);
            const plant = await Plant.findById(submission.plantId);
            
            if (nextApprover && nextApprover.email) {
              const approvalLink = `${process.env.FRONTEND_URL}/employee/approvals/${submission._id}`;
              const previousApprovals = [{ name: currentApprover?.name || "Previous Approver" }];
              
              const plantId = plant?.plantNumber || plant?._id?.toString() || submission.plantId?.toString() || "";
              const formId = (form?.numericalId || submission.formNumericalId)?.toString() || form?.formId || form?._id?.toString() || "";
              const submissionId = submission.numericalId?.toString() || submission._id?.toString() || "";
              
              await sendSubmissionNotificationToApprover(
                nextApprover.email,
                form.formName || form.templateName,
                submitter?.name || "An employee",
                submission.createdAt,
                approvalLink,
                previousApprovals,
                company,
                plant,
                plantId,
                formId,
                submissionId
              );
            }
          } catch (emailError) {
            console.error("Failed to notify next approver:", emailError);
          }
        } else {
          submission.status = "APPROVED";
          submission.approvedAt = new Date();
          submission.approvedBy = userId;
          submission.currentLevel = flow.length + 1;

          // Notify submitter of final approval
          try {
            const submitter = await User.findById(submission.submittedBy);
            
            // Fetch company and plant details
            const company = await Company.findById(submission.companyId);
            const plant = await Plant.findById(submission.plantId);

            if (submitter && submitter.email) {
              // Populate history with approver names
              const historyWithNames = await Promise.all(submission.approvalHistory.map(async (h) => {
                const approver = await User.findById(h.approverId);
                return {
                  name: approver?.name || "Approver",
                  date: h.actionedAt,
                  comments: h.comments
                };
              }));

              const plantId = plant?.plantNumber || plant?._id?.toString() || submission.plantId?.toString() || "";
              const formId = (form?.numericalId || submission.formNumericalId)?.toString() || form?.formId || form?._id?.toString() || "";
              const submissionId = submission.numericalId?.toString() || submission._id?.toString() || "";
              
              await sendFinalApprovalNotificationToSubmitter(
                submitter.email,
                form.formName || form.templateName,
                submission.createdAt,
                historyWithNames,
                company,
                plant,
                plantId,
                formId,
                submissionId
              );
            }
          } catch (emailError) {
            console.error("Failed to notify submitter of final approval:", emailError);
          }
        }

    }

    await submission.save();

    // Send notification to plant admin about approval status (non-blocking)
    (async () => {
      try {
        const plant = await Plant.findById(submission.plantId).populate("adminId");
        const company = await Company.findById(submission.companyId);
        const submitter = await User.findById(submission.submittedBy);
        const approver = await User.findById(userId);
        
        if (plant?.adminId?.email) {
          const viewLink = `${process.env.FRONTEND_URL}/plant/submissions/${submission._id}`;
          const plantId = plant?.plantNumber || plant?._id?.toString() || submission.plantId?.toString() || "";
          const formId = (form?.numericalId || submission.formNumericalId)?.toString() || form?.formId || form?._id?.toString() || "";
          const submissionId = submission.numericalId?.toString() || submission._id?.toString() || "";
          
          await sendApprovalStatusNotificationToPlant(
            plant.adminId.email,
            form.formName || form.templateName,
            submitter?.name || "An employee",
            approver?.name || "An approver",
            status,
            comments || "",
            viewLink,
            company,
            plant,
            plantId,
            formId,
            submissionId
          );
        }
      } catch (emailErr) {
        console.error("Failed to send plant admin approval notification:", emailErr);
      }
    })();

    res.json({ message: `Submission ${status} successfully`, submission });
  } catch (error) {
    console.error("Process approval error:", error);
    res.status(500).json({ message: "Failed to process approval" });
  }
};

// Get stats for employee dashboard
export const getEmployeeStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    // All forms where user is an approver
    const formsWithUserAsApprover = await Form.find({
      "approvalFlow.approverId": userId
    });
    const formIds = formsWithUserAsApprover.map(f => f._id);
    
    // Submissions pending approval where it's actually this user's turn
    const allInProgSubmissions = await FormSubmission.find({
      templateId: { $in: formIds },
      status: { $in: ["PENDING_APPROVAL", "IN_PROGRESS", "in_progress", "SUBMITTED"] }
    }).populate("templateId", "approvalFlow");

    const pendingCount = allInProgSubmissions.filter(sub => {
      const flow = sub.templateId?.approvalFlow || [];
      const userLevel = flow.find(f => f.approverId.toString() === userId.toString())?.level;
      return sub.currentLevel === userLevel;
    }).length;

    // Submissions already actioned by this user
    const actionedCount = await FormSubmission.countDocuments({
      "approvalHistory.approverId": userId
    });

    res.json({
      pendingCount,
      actionedCount
    });
  } catch (error) {
    console.error("Get employee stats error:", error);
    res.status(500).json({ message: "Failed to fetch employee stats" });
  }
};

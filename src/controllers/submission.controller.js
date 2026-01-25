import FormTemplate from "../models/FormTemplate.model.js";
import Form from "../models/Form.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import Assignment from "../models/Assignment.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import mongoose from "mongoose";
import { sendSubmissionNotificationToApprover, sendSubmissionNotificationToPlant } from "../services/email.service.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import fs from "fs";

/* ======================================================
   CREATE SUBMISSION
====================================================== */
export const createSubmission = async (req, res) => {
  try {
    const { 
      templateId, 
      assignmentId,
      plantId, 
      companyId, 
      data, 
      submittedBy, 
      status: requestedStatus 
    } = req.body;
    
    // Process files if any - upload to Cloudinary
    const files = [];
    let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await uploadToCloudinary(fs.readFileSync(file.path), 'submissions');
          files.push({
            fieldId: file.fieldname,
            filename: file.filename,
            originalName: file.originalname,
            path: result.secure_url,
            cloudinaryPublicId: result.public_id,
            mimetype: file.mimetype,
            size: file.size
          });
          parsedData[file.fieldname] = result.secure_url;
          fs.unlink(file.path, () => {});
        } catch (uploadError) {
          console.error("Cloudinary upload error for file:", file.originalname, uploadError);
          files.push({
            fieldId: file.fieldname,
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            mimetype: file.mimetype,
            size: file.size
          });
        }
      }
    }

    // Find the template to check for approval flow
    let template = await FormTemplate.findById(templateId);
    let modelType = "FormTemplate";

    if (!template) {
      template = await Form.findById(templateId);
      modelType = "Form";
    }

    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    // Check workflow/approvalFlow
    const workflow = template.workflow || template.approvalFlow || [];
    const hasFlow = workflow.length > 0;
    
    // Determine status: DRAFT from frontend or based on flow
    let finalStatus = requestedStatus || "PENDING_APPROVAL";
    if (finalStatus !== "DRAFT") {
      finalStatus = hasFlow ? "PENDING_APPROVAL" : "APPROVED";
    }

    // Get form's numerical ID if it's a Form template
    let formNumericalId = null;
    if (modelType === 'Form' && template.numericalId) {
      formNumericalId = template.numericalId;
    }

    const newSubmission = await FormSubmission.create({
      templateId: template._id,
      templateModel: modelType,
      templateName: template.templateName || template.formName,
      formNumericalId: formNumericalId,
      assignmentId: assignmentId || null,
      plantId: plantId || template.plantId || req.user?.plantId,
      companyId: companyId || template.companyId || req.user?.companyId,
      data: parsedData,
      submittedBy: submittedBy || req.user?.userId,
      files,
      status: finalStatus,
      currentLevel: finalStatus === "PENDING_APPROVAL" ? 1 : 0
    });

    // If linked to an assignment, update assignment status
      if (assignmentId && mongoose.isValidObjectId(assignmentId)) {
        await Assignment.findByIdAndUpdate(assignmentId, {
          status: "FILLED",
          submissionId: newSubmission._id,
          submittedAt: new Date()
        });
      }

      res.status(201).json({
        success: true,
        message: finalStatus === "DRAFT" ? "Draft saved successfully" : "Submission created successfully",
        submission: newSubmission
      });

      // Notification logic (non-blocking)
      if (finalStatus === "PENDING_APPROVAL" && hasFlow) {
        (async () => {
          try {
            const firstLevel = workflow.find(w => w.level === 1);
            if (firstLevel) {
              const approverId = firstLevel.approverId?._id || firstLevel.approverId;
              const approver = await User.findById(approverId);
              const submitter = await User.findById(newSubmission.submittedBy);
              
              // Fetch company and plant details
              const company = await Company.findById(newSubmission.companyId);
              const plant = await Plant.findById(newSubmission.plantId);
              
              if (approver && approver.email) {
                const approvalLink = `${process.env.FRONTEND_URL}/employee/approvals/${newSubmission._id}`;
                // Get form with numerical ID
                let form = null;
                if (modelType === 'Form') {
                  form = template;
                } else {
                  form = await Form.findById(template._id).catch(() => null);
                }
                const plantId = plant?.plantNumber || plant?._id?.toString() || newSubmission.plantId?.toString() || "";
                const formId = (form?.numericalId || newSubmission.formNumericalId)?.toString() || form?.formId || form?._id?.toString() || "";
                const submissionId = newSubmission.numericalId?.toString() || newSubmission._id?.toString() || "";
                
                await sendSubmissionNotificationToApprover(
                  approver.email,
                  newSubmission.templateName,
                  submitter?.name || "An employee",
                  newSubmission.createdAt,
                  approvalLink,
                  [],
                  company,
                  plant,
                  plantId,
                  formId,
                  submissionId
                );
              }
            }
      } catch (emailErr) {
          console.error("Failed to send initial submission notification:", emailErr);
        }
      })();
    }

    // Send notification to plant admin (non-blocking)
    (async () => {
      try {
        const plant = await Plant.findById(newSubmission.plantId).populate("adminId");
        const company = await Company.findById(newSubmission.companyId);
        const submitter = await User.findById(newSubmission.submittedBy);
        
        if (plant?.adminId?.email) {
          const viewLink = `${process.env.FRONTEND_URL}/plant/submissions/${newSubmission._id}`;
          let form = null;
          if (newSubmission.templateModel === 'Form') {
            form = await Form.findById(newSubmission.templateId).catch(() => null);
          } else {
            form = await Form.findById(newSubmission.templateId).catch(() => null);
          }
          const plantId = plant?.plantNumber || plant?._id?.toString() || newSubmission.plantId?.toString() || "";
          const formId = (form?.numericalId || newSubmission.formNumericalId)?.toString() || form?.formId || form?._id?.toString() || "";
          const submissionId = newSubmission.numericalId?.toString() || newSubmission._id?.toString() || "";
          
          await sendSubmissionNotificationToPlant(
            plant.adminId.email,
            newSubmission.templateName,
            submitter?.name || "An employee",
            newSubmission.createdAt,
            viewLink,
            company,
            plant,
            plantId,
            formId,
            submissionId
          );
        }
      } catch (emailErr) {
        console.error("Failed to send plant admin notification:", emailErr);
      }
    })();

  } catch (error) {
    console.error("Create submission error:", error);
    res.status(500).json({ success: false, message: "Failed to create submission" });
  }
};

/* ======================================================
   GET SUBMISSIONS (LIST) - Enhanced with filters
====================================================== */
export const getSubmissions = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "PLANT_ADMIN") {
      filter.plantId = req.user.plantId;
    } else if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === "SUPER_ADMIN") {
      if (req.query.plantId) filter.plantId = req.query.plantId;
      if (req.query.companyId) filter.companyId = req.query.companyId;
    } else if (req.user.role === "EMPLOYEE") {
      filter.submittedBy = req.user.userId;
    }

    if (req.query.templateId) filter.templateId = req.query.templateId;
    if (req.query.status) filter.status = req.query.status;
    
    if (req.query.startDate || req.query.endDate) {
      filter.submittedAt = {};
      if (req.query.startDate) filter.submittedAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.submittedAt.$lte = new Date(req.query.endDate);
    }

    if (req.query.submittedBy) {
      filter.submittedBy = req.query.submittedBy;
    }

        const submissions = await FormSubmission.find(filter)
          .populate("templateId", "templateName formName workflow approvalFlow")
          .populate("approvalHistory.approverId", "name email")
          .populate("plantId", "name")
          .populate({
            path: "submittedBy",
            model: "User",
            select: "name email",
            strictPopulate: false
          })
          .sort({ createdAt: -1 });

        const enrichedSubmissions = submissions.map(sub => {
          const subObj = sub.toObject();
          const lastApproval = subObj.approvalHistory && subObj.approvalHistory.length > 0
            ? subObj.approvalHistory[subObj.approvalHistory.length - 1]
            : null;
          
            return {
              ...subObj,
              templateName: subObj.templateName || subObj.templateId?.templateName || "Unknown Form",
              plantName: subObj.plantId?.name || "N/A",
              lastApprovedBy: lastApproval?.approverId?.name || null,
              lastActionAt: lastApproval?.actionedAt || null
            };
        });

    res.json({ success: true, data: enrichedSubmissions });
  } catch (error) {
    console.error("Get submissions error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch submissions" });
  }
};

/* ======================================================
   GET SINGLE SUBMISSION
====================================================== */
export const getSubmissionById = async (req, res) => {
  try {
    const submission = await FormSubmission.findById(req.params.id)
      .populate("templateId")
      .populate("plantId", "name location")
      .populate("companyId", "name")
      .populate("submittedBy", "name email");

    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }

    const enrichedData = { ...submission.data };
    if (submission.files && submission.files.length > 0) {
      submission.files.forEach(file => {
        if (file.fieldId && file.path) {
          if (file.path.startsWith('http://') || file.path.startsWith('https://')) {
            enrichedData[file.fieldId] = file.path;
          } else {
            const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5001}`;
            const normalizedPath = file.path.replace(/\\/g, '/').replace(/^uploads\//, '');
            enrichedData[file.fieldId] = `${baseUrl}/uploads/${normalizedPath}`;
          }
        }
      });
    }

    const result = submission.toObject();
    result.data = enrichedData;

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Get submission error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch submission" });
  }
};

/* ======================================================
   UPDATE STATUS
====================================================== */
export const updateStatus = async (req, res) => {
  try {
    const { status, comments } = req.body;
    const updateData = { status: status.toUpperCase() };

    if (updateData.status === "APPROVED") {
      updateData.approvedAt = new Date();
      updateData.approvedBy = req.user.userId;
    } else if (updateData.status === "REJECTED") {
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = req.user.userId;
    }

    // Add to approval history
    const submission = await FormSubmission.findById(req.params.id);
    if (!submission) {
       return res.status(404).json({ success: false, message: "Submission not found" });
    }

    submission.approvalHistory.push({
        level: submission.currentLevel,
        approverId: req.user.userId,
        status: updateData.status,
        comments: comments || "",
        actionedAt: new Date()
    });

    submission.status = updateData.status;
    if (updateData.status === "APPROVED") {
        submission.approvedAt = updateData.approvedAt;
        submission.approvedBy = updateData.approvedBy;
    } else if (updateData.status === "REJECTED") {
        submission.rejectedAt = updateData.rejectedAt;
        submission.rejectedBy = updateData.rejectedBy;
    }

    const updated = await submission.save();

    res.json({ success: true, message: "Status updated successfully", updated });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};

/* ======================================================
   GET TEMPLATE ANALYTICS
====================================================== */
export const getTemplateAnalytics = async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const filter = { templateId: templateId };
    
    if (req.user.role === "PLANT_ADMIN") {
      filter.plantId = req.user.plantId;
    } else if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    }

    const submissions = await FormSubmission.find(filter)
      .populate("templateId", "workflow approvalFlow")
      .lean();

    const total = submissions.length;
    const approved = submissions.filter(s => s.status === "APPROVED").length;
    const pending = submissions.filter(s => ["PENDING_APPROVAL", "IN_PROGRESS"].includes(s.status)).length;
    const rejected = submissions.filter(s => s.status === "REJECTED").length;

    let template = await FormTemplate.findById(templateId).select("workflow templateName").lean();
    if (!template) {
      template = await Form.findById(templateId).select("approvalFlow formName").lean();
    }
    
    const workflow = template?.workflow || template?.approvalFlow || [];
    const totalLevels = workflow.length || 0;

    const levelStats = [];
    for (let level = 1; level <= totalLevels; level++) {
      const approvedAtLevel = submissions.filter(sub => {
        if (!sub.approvalHistory) return false;
        return sub.approvalHistory.some(h => h.level === level && h.status === "APPROVED");
      }).length;
      
      levelStats.push({
        level,
        approved: approvedAtLevel,
        total
      });
    }

    const approvedSubmissions = submissions.filter(s => s.status === "APPROVED" && s.approvedAt && s.submittedAt);
    let avgApprovalTimeMs = 0;
    if (approvedSubmissions.length > 0) {
      const totalTime = approvedSubmissions.reduce((acc, sub) => {
        return acc + (new Date(sub.approvedAt) - new Date(sub.submittedAt));
      }, 0);
      avgApprovalTimeMs = totalTime / approvedSubmissions.length;
    }

    const formatTime = (ms) => {
      if (ms === 0) return "N/A";
      const hours = Math.floor(ms / (1000 * 60 * 60));
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    };

    const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        templateName: template?.templateName || "Unknown",
        total,
        approved,
        pending,
        rejected,
        levelStats,
        avgApprovalTime: formatTime(avgApprovalTimeMs),
        completionRate
      }
    });
  } catch (error) {
    console.error("Get template analytics error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch template analytics" });
  }
};

import Form from "../models/Form.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { sendSubmissionNotificationToApprover } from "../services/email.service.js";
import fs from "fs";

/* ======================================================
   CREATE SUBMISSION
====================================================== */
export const createSubmission = async (req, res) => {
  try {
    const { 
      formId, 
      data, 
      status = "DRAFT"
    } = req.body;
    
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ 
        success: false, 
        message: "Form not found" 
      });
    }

    // Process files if any
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
            url: result.secure_url,
            mimetype: file.mimetype,
            size: file.size
          });
          parsedData[file.fieldname] = result.secure_url;
          fs.unlinkSync(file.path);
        } catch (uploadError) {
          console.error("File upload error:", file.originalname, uploadError);
          fs.unlinkSync(file.path);
        }
      }
    }

    // Determine initial status
    const hasApprovalFlow = form.approvalFlow && form.approvalFlow.length > 0;
    const initialStatus = status === "SUBMITTED" && hasApprovalFlow 
      ? "PENDING_APPROVAL" 
      : status;

    const submissionData = {
      formId: form._id,
      formName: form.formName,
      submittedBy: userId,
      submittedByName: user.name,
      submittedByEmail: user.email,
      data: parsedData,
      files: files,
      status: initialStatus,
      companyId: user.companyId,
      plantId: user.plantId,
      currentLevel: initialStatus === "PENDING_APPROVAL" ? 1 : 0
    };

    const submission = await FormSubmission.create(submissionData);

    res.status(201).json({
      success: true,
      message: "Submission created successfully",
      data: submission
    });

  } catch (error) {
    console.error("Create submission error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create submission",
      error: error.message 
    });
  }
};

/* ======================================================
   GET ALL SUBMISSIONS
====================================================== */
export const getSubmissions = async (req, res) => {
  try {
    const { 
      formId, 
      status, 
      page = 1, 
      limit = 20,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { isArchived: false };
    
    // Role-based filtering
    if (req.user.role === "PLANT_ADMIN") {
      filter.plantId = req.user.plantId;
    } else if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === "EMPLOYEE") {
      filter.submittedBy = req.user.userId;
    }

    if (formId) filter.formId = formId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const submissions = await FormSubmission.find(filter)
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email")
      .populate("formId", "formName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await FormSubmission.countDocuments(filter);

    res.json({
      success: true,
      data: submissions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error("Get submissions error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch submissions" 
    });
  }
};

/* ======================================================
   GET SUBMISSION BY ID
====================================================== */
export const getSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await FormSubmission.findById(id)
      .populate({
        path: "formId",
        select: "formName approvalFlow fields sections",
        populate: {
          path: "approvalFlow.approverId",
          select: "name email"
        }
      })
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email")
      .populate("rejectedBy", "name email")
      .populate("companyId", "name")
      .populate("plantId", "name");

    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: "Submission not found" 
      });
    }

    // Authorization check
    if (req.user.role === "EMPLOYEE" && submission.submittedBy._id.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied" 
      });
    }

    res.json({
      success: true,
      data: submission
    });

  } catch (error) {
    console.error("Get submission error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch submission" 
    });
  }
};

/* ======================================================
   UPDATE SUBMISSION
====================================================== */
export const updateSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, status } = req.body;

    const submission = await FormSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: "Submission not found" 
      });
    }

    // Authorization check
    if (req.user.role === "EMPLOYEE" && submission.submittedBy.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied" 
      });
    }

    // Only allow updating DRAFT submissions
    if (submission.status !== "DRAFT") {
      return res.status(400).json({ 
        success: false, 
        message: "Only draft submissions can be updated" 
      });
    }

    if (data) {
      submission.data = typeof data === 'string' ? JSON.parse(data) : data;
    }

    if (status) {
      submission.status = status;
    }

    const updated = await submission.save();

    res.json({
      success: true,
      message: "Submission updated successfully",
      data: updated
    });

  } catch (error) {
    console.error("Update submission error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update submission" 
    });
  }
};

/* ======================================================
   DELETE SUBMISSION
====================================================== */
export const deleteSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    const submission = await FormSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: "Submission not found" 
      });
    }

    // Authorization check
    if (req.user.role === "EMPLOYEE" && submission.submittedBy.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied" 
      });
    }

    // Only allow deleting DRAFT submissions
    if (submission.status !== "DRAFT") {
      return res.status(400).json({ 
        success: false, 
        message: "Only draft submissions can be deleted" 
      });
    }

    await FormSubmission.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Submission deleted successfully"
    });

  } catch (error) {
    console.error("Delete submission error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete submission" 
    });
  }
};

/* ======================================================
   SUBMIT DRAFT SUBMISSION
====================================================== */
export const submitDraft = async (req, res) => {
  try {
    const { id } = req.params;

    const submission = await FormSubmission.findById(id).populate("formId");
    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: "Submission not found" 
      });
    }

    // Authorization check
    if (req.user.role === "EMPLOYEE" && submission.submittedBy.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied" 
      });
    }

    if (submission.status !== "DRAFT") {
      return res.status(400).json({ 
        success: false, 
        message: "Only draft submissions can be submitted" 
      });
    }

    const form = submission.formId;
    const hasApprovalFlow = form?.approvalFlow && form.approvalFlow.length > 0;
    const newStatus = hasApprovalFlow ? "PENDING_APPROVAL" : "APPROVED";

    submission.status = newStatus;
    submission.submittedAt = new Date();
    submission.currentLevel = newStatus === "PENDING_APPROVAL" ? 1 : 0;

    if (newStatus === "APPROVED") {
      submission.approvedAt = new Date();
      submission.approvedBy = req.user.userId;
    }

    const updated = await submission.save();

    res.json({
      success: true,
      message: "Submission submitted successfully",
      data: updated
    });

  } catch (error) {
    console.error("Submit draft error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to submit submission" 
    });
  }
};

/* ======================================================
   GET SUBMISSION STATS
====================================================== */
export const getSubmissionStats = async (req, res) => {
  try {
    const filter = { isArchived: false };
    
    if (req.user.role === "PLANT_ADMIN") {
      filter.plantId = req.user.plantId;
    } else if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === "EMPLOYEE") {
      filter.submittedBy = req.user.userId;
    }

    const stats = await FormSubmission.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      draft: 0,
      submitted: 0,
      pending_approval: 0,
      approved: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      const statusKey = stat._id.toLowerCase().replace('-', '_');
      formattedStats[statusKey] = stat.count;
    });

    const total = Object.values(formattedStats).reduce((sum, count) => sum + count, 0);
    formattedStats.total = total;

    res.json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch statistics" 
    });
  }
};
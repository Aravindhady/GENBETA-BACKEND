import Form from "../models/Form.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import Assignment from "../models/Assignment.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import { sendApprovalEmail, sendFormCreatedApproverNotification } from "../services/email.service.js";

/* ======================================================
   CREATE FORM
====================================================== */
export const createForm = async (req, res) => {
  try {
    const { formId, formName, fields, sections, approvalFlow, approvalLevels, description, status } = req.body;

    // Map approvalLevels from frontend to approvalFlow for backend
    const finalApprovalFlow = (approvalLevels || approvalFlow || []).map((level, index) => ({
      level: index + 1,
      approverId: level.approverId,
      name: level.name || `Level ${index + 1}`,
      description: level.description || ""
    }));

    const form = await Form.create({
      formId,
      formName,
      description,
      fields: fields || [],
      sections: sections || [],
      approvalFlow: finalApprovalFlow,
      companyId: req.user.companyId,
      plantId: req.user.plantId,
      createdBy: req.user.userId,
      status: status || "DRAFT",
      isTemplate: req.body.isTemplate || false
    });

    res.status(201).json({
      success: true,
      message: "Form created successfully",
      form
    });

    // Send email notifications to all approvers (non-blocking)
    if (finalApprovalFlow.length > 0) {
      (async () => {
        try {
          const creator = await User.findById(req.user.userId);
          const company = await Company.findById(req.user.companyId);
          const plant = await Plant.findById(req.user.plantId);
          
          for (const level of finalApprovalFlow) {
            const approver = await User.findById(level.approverId);
            if (approver && approver.email) {
              const reviewLink = `${process.env.FRONTEND_URL}/plant/forms/${form._id}`;
              await sendFormCreatedApproverNotification(
                approver.email,
                formName,
                creator?.name || "A plant admin",
                reviewLink,
                company,
                plant
              );
            }
          }
        } catch (emailErr) {
          console.error("Failed to send form created notifications:", emailErr);
        }
      })();
    }
  } catch (error) {
    console.error("Create form error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create form" });
  }
};

/* ======================================================
   GET FORMS (LIST)
====================================================== */
export const getForms = async (req, res) => {
  try {
    const filter = { isActive: true };

      if (req.user.role === "PLANT_ADMIN") {
        filter.plantId = req.user.plantId;
        } else if (req.user.role === "EMPLOYEE") {
          filter.plantId = req.user.plantId;
          filter.status = { $in: ["APPROVED", "PUBLISHED"] };
          filter.isTemplate = true;
        }

    const forms = await Form.find(filter).sort({ createdAt: -1 });

    const data = await Promise.all(
      forms.map(async (form) => {
        let submissionCount = 0;
        try {
          submissionCount = await FormSubmission.countDocuments({ formId: form._id });
        } catch (err) {
          console.error(`Error counting submissions for form ${form._id}:`, err);
        }
        return {
          ...form.toObject(),
          id: form._id,
          submissionCount
        };
      })
    );

res.json({ success: true, data });
} catch (error) {
console.error("Get forms error:", error);
res.status(500).json({ success: false, message: "Failed to fetch forms" });
}
};

/* ======================================================
GET SINGLE FORM
====================================================== */
export const getFormById = async (req, res) => {
try {
const form = await Form.findById(req.params.id).populate("approvalFlow.approverId", "name email");
if (!form) {
return res.status(404).json({ success: false, message: "Form not found" });
}
res.json({ success: true, data: form });
} catch (error) {
console.error("Get form by id error:", error);
res.status(500).json({ success: false, message: "Failed to fetch form" });
}
};

/* ======================================================
   UPDATE FORM
====================================================== */
export const updateForm = async (req, res) => {
  try {
    const { formId, formName, fields, sections, approvalFlow, approvalLevels, description } = req.body;

    // Map approvalLevels from frontend to approvalFlow for backend if provided
    let finalPayload = { ...req.body };
    
    if (approvalLevels || approvalFlow) {
      finalPayload.approvalFlow = (approvalLevels || approvalFlow || []).map((level, index) => ({
        level: index + 1,
        approverId: level.approverId,
        name: level.name || `Level ${index + 1}`,
        description: level.description || ""
      }));
      delete finalPayload.approvalLevels;
    }

    const updated = await Form.findByIdAndUpdate(
      req.params.id,
      finalPayload,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    res.json({
      success: true,
      message: "Form updated successfully",
      updated
    });
  } catch (error) {
    console.error("Update form error:", error);
    res.status(500).json({ success: false, message: error.message || "Update failed" });
  }
};

/* ======================================================
   DELETE FORM (SOFT DELETE)
====================================================== */
export const deleteForm = async (req, res) => {
  try {
    await Form.findByIdAndUpdate(req.params.id, {
      isActive: false
    });

    res.json({ message: "Form removed successfully" });
  } catch (error) {
    console.error("Delete form error:", error);
    res.status(500).json({ message: "Delete failed" });
  }
};

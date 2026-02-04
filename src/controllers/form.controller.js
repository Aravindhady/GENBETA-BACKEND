import Form from "../models/Form.model.js";
import FormTemplate from "../models/FormTemplate.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import Assignment from "../models/Assignment.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import { sendApprovalEmail, sendFormCreatedApproverNotification } from "../services/email.service.js";
import { generateCacheKey, getFromCache, setInCache } from "../utils/cache.js";

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
          // Employee can see all published forms (whether templates or regular forms)
          filter.status = { $in: ["APPROVED", "PUBLISHED"] };
        }

    console.log(`User role: ${req.user.role}`);
    console.log(`User plantId: ${req.user.plantId}`);
    console.log(`Applied filter:`, JSON.stringify(filter, null, 2));

    // Handle pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Generate cache key
    const cacheParams = { page, limit, role: req.user.role };
    if (filter.plantId) cacheParams.plantId = filter.plantId;
    if (filter.$and) {
      const statusCondition = filter.$and.find(cond => cond.status);
      const isTemplateCondition = filter.$and.find(cond => cond.$or);
      if (statusCondition) cacheParams.status = JSON.stringify(statusCondition.status);
      if (isTemplateCondition) cacheParams.isTemplateConditions = 'employee_specific';
    } else if (filter.status) {
      cacheParams.status = JSON.stringify(filter.status);
    }
    const cacheKey = generateCacheKey('forms', cacheParams);
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      console.log('Returning cached result');
      return res.json(cachedResult);
    }

    // Count total forms for pagination metadata
    const total = await Form.countDocuments(filter);
    console.log(`Total forms matching filter: ${total}`);

    // Get paginated forms
    const forms = await Form.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`Found ${forms.length} forms`);
    if (forms.length > 0) {
      console.log('Sample forms:');
      forms.slice(0, 3).forEach(form => {
        console.log(`  - ${form.formName} (status: ${form.status}, isTemplate: ${form.isTemplate})`);
      });
    }

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
    
    const result = { 
      success: true, 
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
    
    // Cache the result for 5 minutes
    await setInCache(cacheKey, result, 300);

    res.json(result);
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
    // First, try to find in Form model
    let form = await Form.findById(req.params.id).populate("approvalFlow.approverId", "name email");
    
    if (!form) {
      // If not found in Form model, try FormTemplate model
      form = await FormTemplate.findById(req.params.id).populate("workflow.approverId", "name email");
    }
    
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

    // Get the original form to check if approval workflow is being added/changed
    const originalForm = await Form.findById(req.params.id);
    
    const updated = await Form.findByIdAndUpdate(
      req.params.id,
      finalPayload,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    // Send email notifications to approvers when workflow is assigned/updated
    if (finalPayload.approvalFlow && finalPayload.approvalFlow.length > 0) {
      // Check if this is a new workflow assignment or an update
      const isWorkflowUpdate = !originalForm.approvalFlow || originalForm.approvalFlow.length === 0 || 
                              JSON.stringify(originalForm.approvalFlow) !== JSON.stringify(finalPayload.approvalFlow);
      
      if (isWorkflowUpdate) {
        (async () => {
          try {
            const updater = await User.findById(req.user.userId);
            const company = await Company.findById(req.user.companyId);
            const plant = await Plant.findById(req.user.plantId);
            
            for (const level of finalPayload.approvalFlow) {
              const approver = await User.findById(level.approverId);
              if (approver && approver.email) {
                const reviewLink = `${process.env.FRONTEND_URL}/plant/forms/${updated._id}`;
                await sendFormCreatedApproverNotification(
                  approver.email,
                  updated.formName,
                  updater?.name || "A plant admin",
                  reviewLink,
                  company,
                  plant,
                  "PLANT_ADMIN",
                  req.user.companyId,
                  req.user.plantId
                );
              }
            }
          } catch (emailErr) {
            console.error("Failed to send workflow assignment notifications:", emailErr);
          }
        })();
      }
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
   ARCHIVE FORM
====================================================== */
export const archiveForm = async (req, res) => {
  try {
    const form = await Form.findByIdAndUpdate(
      req.params.id,
      { status: "ARCHIVED", archivedAt: new Date() },
      { new: true }
    );
    
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }
    
    res.json({ success: true, message: "Form archived successfully", data: form });
  } catch (error) {
    console.error("Archive form error:", error);
    res.status(500).json({ success: false, message: "Archive failed" });
  }
};

/* ======================================================
   RESTORE FORM
====================================================== */
export const restoreForm = async (req, res) => {
  try {
    const form = await Form.findByIdAndUpdate(
      req.params.id,
      { status: "PUBLISHED", archivedAt: null },
      { new: true }
    );
    
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }
    
    res.json({ success: true, message: "Form restored successfully", data: form });
  } catch (error) {
    console.error("Restore form error:", error);
    res.status(500).json({ success: false, message: "Restore failed" });
  }
};

/* ======================================================
   TOGGLE TEMPLATE STATUS
====================================================== */
export const toggleTemplateStatus = async (req, res) => {
  try {
    const { isTemplate } = req.body;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }
    
    // Only allow toggling if the form belongs to the same plant
    if (form.plantId.toString() !== req.user.plantId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to update this form" });
    }
    
    const updated = await Form.findByIdAndUpdate(
      req.params.id,
      { isTemplate },
      { new: true }
    );
    
    res.json({
      success: true,
      message: `Form ${isTemplate ? 'saved as' : 'removed from'} template successfully`,
      updated
    });
  } catch (error) {
    console.error("Toggle template status error:", error);
    res.status(500).json({ success: false, message: "Toggle template status failed" });
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

import FormTemplate from "../models/FormTemplate.model.js";
import FormSubmission from "../models/FormSubmission.model.js";
import { validateFormCreation } from "../utils/planLimits.js";

export const createTemplate = async (req, res) => {
  try {
    const { templateName, description, fields, workflow, status } = req.body;

    const validation = await validateFormCreation(req.user.companyId, req.user.plantId);
    if (!validation.allowed) {
      return res.status(403).json({ 
        success: false,
        message: validation.message,
        upgradeRequired: validation.upgradeRequired,
        currentCount: validation.currentCount,
        limit: validation.limit
      });
    }

    const template = await FormTemplate.create({
      templateName,
      description,
      fields,
      workflow,
      status: status || "DRAFT",
      companyId: req.user.companyId,
      plantId: req.user.plantId,
      createdBy: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: template
    });
  } catch (error) {
    console.error("Create template error:", error);
    res.status(500).json({ success: false, message: "Failed to create template" });
  }
};

export const getTemplates = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { isActive: true };

    if (req.user.role === "PLANT_ADMIN") {
      filter.plantId = req.user.plantId;
    } else if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    }

    if (status) {
      filter.status = status;
    }

    const templates = await FormTemplate.find(filter).sort({ createdAt: -1 });

    res.json({ success: true, data: templates });
  } catch (error) {
    console.error("Get templates error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch templates" });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const template = await FormTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    console.error("Get template by id error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch template" });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const updated = await FormTemplate.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      success: true,
      message: "Template updated successfully",
      data: updated
    });
  } catch (error) {
    console.error("Update template error:", error);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;

    // Guard: Check if template has submissions
    const submissionCount = await FormSubmission.countDocuments({ templateId });
    if (submissionCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot delete template with existing submissions. Archive it instead." 
      });
    }

    await FormTemplate.findByIdAndUpdate(templateId, { isActive: false });
    res.json({ success: true, message: "Template removed successfully" });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};

export const archiveTemplate = async (req, res) => {
  try {
    const template = await FormTemplate.findByIdAndUpdate(
      req.params.id,
      { status: "ARCHIVED", archivedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, message: "Template archived successfully", data: template });
  } catch (error) {
    console.error("Archive template error:", error);
    res.status(500).json({ success: false, message: "Archive failed" });
  }
};

export const restoreTemplate = async (req, res) => {
  try {
    const template = await FormTemplate.findByIdAndUpdate(
      req.params.id,
      { status: "PUBLISHED", archivedAt: null },
      { new: true }
    );
    res.json({ success: true, message: "Template restored successfully", data: template });
  } catch (error) {
    console.error("Restore template error:", error);
    res.status(500).json({ success: false, message: "Restore failed" });
  }
};

export const incrementUsageCount = async (templateId) => {
  try {
    await FormTemplate.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });
  } catch (error) {
    console.error("Increment usage count error:", error);
  }
};

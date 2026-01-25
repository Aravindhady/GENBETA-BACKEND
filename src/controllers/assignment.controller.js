import Assignment from "../models/Assignment.model.js";
import FormTemplate from "../models/FormTemplate.model.js";
import Form from "../models/Form.model.js";

export const assignTemplateToEmployees = async (req, res) => {
  try {
    const { templateId, templateIds, employeeIds, dueDate } = req.body;

    // Support both single templateId and multiple templateIds
    const ids = templateIds || (templateId ? [templateId] : []);

    if (ids.length === 0 || !employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({ success: false, message: "Invalid assignment data" });
    }

    const assignments = [];
    const errors = [];

    for (const id of ids) {
      // 1. Try to find in FormTemplate
      let template = await FormTemplate.findById(id);
      let modelType = "FormTemplate";

      // 2. If not found, try to find in Form (Modern templates)
      if (!template) {
        template = await Form.findById(id);
        modelType = "Form";
      }

      if (!template) {
        errors.push(`Template with ID ${id} not found`);
        continue;
      }

      if (template.status === "ARCHIVED") {
        errors.push(`Template "${template.templateName || template.formName}" is archived and cannot be assigned`);
        continue;
      }

      // Prepare assignments for each employee for this template
      employeeIds.forEach(employeeId => {
        assignments.push({
          templateId: id,
          templateModel: modelType,
          employeeId,
          assignedBy: req.user.userId,
          plantId: req.user.plantId,
          companyId: req.user.companyId,
          dueDate: dueDate ? new Date(dueDate) : null
        });
      });
    }

    if (assignments.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: errors.length > 0 ? errors.join(", ") : "No valid templates found for assignment" 
      });
    }

    await Assignment.insertMany(assignments);

    res.status(201).json({
      success: true,
      message: `Successfully assigned ${ids.length} templates to ${employeeIds.length} employees`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Assign template error:", error);
    res.status(500).json({ success: false, message: "Failed to assign template" });
  }
};

export const getMyAssignments = async (req, res) => {
  try {
    const query = { employeeId: req.user.userId };
    
    // If status is provided in query, use it, otherwise return all
    if (req.query.status) {
      query.status = req.query.status.toUpperCase();
    }

    const assignments = await Assignment.find(query)
    .populate({
      path: "templateId",
      select: "templateName formName description sections fields workflow status",
      match: { status: { $ne: "ARCHIVED" } }
    })
    .sort({ createdAt: -1 });

    // Filter out assignments where templateId is null (due to ARCHIVED match)
    const activeAssignments = assignments.filter(a => a.templateId);

    res.json({ success: true, data: activeAssignments });
  } catch (error) {
    console.error("Get my assignments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch assignments" });
  }
};

export const getPlantAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find({ plantId: req.user.plantId })
      .populate("templateId", "templateName formName")
      .populate("employeeId", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error("Get plant assignments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch plant assignments" });
  }
};

export const deleteAssignment = async (req, res) => {
  try {
    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Assignment removed" });
  } catch (error) {
    console.error("Delete assignment error:", error);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};

export const getAssignmentById = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("templateId")
      .populate("assignedBy", "name email");

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error("Get assignment error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch assignment" });
  }
};

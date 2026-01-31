import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  label: { type: String },
  placeholder: { type: String },
  required: { type: Boolean, default: false },
  width: { type: String, default: "100%" },
  alignment: { type: String, default: "left" },
  options: [String],
  question: { type: String }, // For checklist-row
  rowHeight: { type: String, default: "auto" },
  description: { type: String }, // For section-header
  content: { type: String }, // For description text/terms
  columns: [{ 
    id: String, 
    label: String, 
    width: String 
  }], // For grid-table
  rows: { type: Number, default: 1 }, // For grid-table
  repeatable: { type: Boolean, default: false }, // For grid-table
  items: [{
    id: String,
    question: String
  }], // For checklist
  height: { type: String }, // For spacer
  maxFileSize: { type: Number, default: 5 },
  fields: [String], // For auto-user
  format: { type: String }, // For auto-date
  validation: {
    min: Number,
    max: Number,
    regex: String
  },
  
  // Approval Email Control
  includeInApprovalEmail: { type: Boolean, default: false }
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  fields: [fieldSchema]
}, { _id: false });

const workflowStepSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  name: { type: String, required: true }, // Supervisor, Manager, etc.
  role: { type: String },
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isParallel: { type: Boolean, default: false }
}, { _id: false });

const formTemplateSchema = new mongoose.Schema({
  templateName: { type: String, required: true },
  description: { type: String, default: "" },
  sections: [sectionSchema],
  fields: [fieldSchema], // Legacy support
  workflow: [workflowStepSchema],
  status: { 
    type: String, 
    enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], 
    default: "DRAFT" 
  },
  visibilityMode: {
    type: String,
    enum: ["OPEN", "ASSIGNED"],
    default: "OPEN"
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant" },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    usageCount: { type: Number, default: 0 },
    archivedAt: { type: Date }
  }, { timestamps: true });

export default mongoose.model("FormTemplate", formTemplateSchema);

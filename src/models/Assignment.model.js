import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema({
  templateId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    refPath: 'templateModel'
  },
  templateModel: {
    type: String,
    required: true,
    enum: ['FormTemplate', 'Form'],
    default: 'FormTemplate'
  },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    status: { 
      type: String, 
      enum: ["PENDING", "SUBMITTED", "FILLED"], 
      default: "PENDING" 
    },
  dueDate: { type: Date },
  submittedAt: { type: Date },
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "FormSubmission" }
}, { timestamps: true });

assignmentSchema.index({ employeeId: 1, status: 1 });
assignmentSchema.index({ templateId: 1 });

export default mongoose.model("Assignment", assignmentSchema);

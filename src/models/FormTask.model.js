import mongoose from "mongoose";

const formTaskSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  status: { 
    type: String, 
    enum: ["pending", "completed"], 
    default: "pending" 
  },
  completedAt: { type: Date },
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "FormSubmission" }
}, { timestamps: true });

formTaskSchema.index({ assignedTo: 1, status: 1 });
formTaskSchema.index({ formId: 1 });

export default mongoose.model("FormTask", formTaskSchema);

import mongoose from "mongoose";

const approvalTaskSchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  formIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true }],
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", required: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  status: { 
    type: String, 
    enum: ["PENDING", "IN_PROGRESS", "COMPLETED"], 
    default: "PENDING",
    index: true 
  },
  dueDate: { type: Date },
  completedForms: [{ type: mongoose.Schema.Types.ObjectId, ref: "Form" }], // Track which forms in the task are completed
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default mongoose.model("ApprovalTask", approvalTaskSchema);

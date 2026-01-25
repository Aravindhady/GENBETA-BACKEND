import mongoose from "mongoose";

const approvalLinkSchema = new mongoose.Schema({
  formIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true }],
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", required: true },
  token: { type: String, required: true, unique: true },
  approverEmail: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  isUsed: { type: Boolean, default: false },
  completedForms: [{ type: mongoose.Schema.Types.ObjectId, ref: "Form" }]
}, { timestamps: true });

export default mongoose.model("ApprovalLink", approvalLinkSchema);

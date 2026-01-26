import mongoose from "mongoose";

const plantSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  name: { type: String, required: true },
  plantNumber: { type: String },
  location: { type: String },
  code: { type: String },
  isActive: { type: Boolean, default: true },
  templateFeatureEnabled: { type: Boolean, default: null } // null = inherit from company, true/false = override
}, { timestamps: true });

// Add indexes for better query performance
plantSchema.index({ companyId: 1, isActive: 1 });
plantSchema.index({ code: 1 });
plantSchema.index({ createdAt: -1 });

export default mongoose.model("Plant", plantSchema);
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

export default mongoose.model("Plant", plantSchema);

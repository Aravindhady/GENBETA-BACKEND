import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN", "EMPLOYEE"],
    required: true 
  },
  phoneNumber: { type: String },
  position: { type: String },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant" },
  permissions: {
    canFillForms: { type: Boolean, default: true },
    canApprove: { type: Boolean, default: false },
    approvalLevels: [{ type: Number }]
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Add indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ companyId: 1 });
userSchema.index({ plantId: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ role: 1, companyId: 1 });
userSchema.index({ role: 1, plantId: 1 });

export default mongoose.model("User", userSchema);
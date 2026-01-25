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

export default mongoose.model("User", userSchema);

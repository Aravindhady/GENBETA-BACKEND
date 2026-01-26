import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String },
  contactEmail: { type: String },
  contactPhone: { type: String },
  industry: { type: String },
  gstNumber: { type: String },
  logoUrl: { type: String },
  isActive: { type: Boolean, default: true },
  templateFeatureEnabled: { type: Boolean, default: false }, // Company-level template feature toggle
    subscription: {
      plan: { 
        type: String, 
        enum: ["SILVER", "GOLD", "PREMIUM", "CUSTOM"], 
        default: "SILVER" 
      },
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date },
      isActive: { type: Boolean, default: true },
      billingCycle: { type: String, enum: ["monthly", "yearly", "manual"], default: "monthly" },
      customLimits: {
        maxPlants: { type: Number },
        maxFormsPerPlant: { type: Number },
        maxEmployeesPerPlant: { type: Number },
        approvalLevels: { type: Number }
      }
    }
}, { timestamps: true });

// Add indexes for better query performance
companySchema.index({ isActive: 1 });
companySchema.index({ createdAt: -1 });
companySchema.index({ name: 1 });
companySchema.index({ subscription: 1 });

export default mongoose.model("Company", companySchema);
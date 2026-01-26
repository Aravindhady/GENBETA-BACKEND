import mongoose from "mongoose";

const approvalHistorySchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  level: { type: Number, required: true },
  status: { type: String, enum: ["APPROVED", "REJECTED"], required: true },
  comments: String,
  approvedAt: { type: Date, default: Date.now }
});

const formSubmissionSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, required: true },
  templateModel: { type: String, enum: ["Form", "FormTemplate"], default: "Form" },
  templateName: { type: String, required: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  submittedByName: { type: String, required: true },
  submittedByEmail: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { 
    type: String, 
    enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "IN_PROGRESS", "SUBMITTED"], 
    default: "PENDING_APPROVAL" 
  },
  currentLevel: { type: Number, default: 1 },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", required: true },
  approvalHistory: [approvalHistorySchema],
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

// Add indexes for better query performance
formSubmissionSchema.index({ templateId: 1, status: 1 });
formSubmissionSchema.index({ submittedBy: 1 });
formSubmissionSchema.index({ companyId: 1, status: 1 });
formSubmissionSchema.index({ plantId: 1, status: 1 });
formSubmissionSchema.index({ status: 1 });
formSubmissionSchema.index({ submittedAt: -1 });
formSubmissionSchema.index({ currentLevel: 1, status: 1 });
formSubmissionSchema.index({ companyId: 1, submittedAt: -1 });
formSubmissionSchema.index({ plantId: 1, submittedAt: -1 });

// Generate numerical ID before saving
formSubmissionSchema.pre('save', async function(next) {
  if (!this.numericalId && this.isNew) {
    try {
      const FormSubmissionModel = mongoose.model('FormSubmission');
      const maxSubmission = await FormSubmissionModel.findOne().sort({ numericalId: -1 });
      this.numericalId = maxSubmission && maxSubmission.numericalId ? maxSubmission.numericalId + 1 : 1;
    } catch (err) {
      console.error('Error generating numerical ID for submission:', err);
      this.numericalId = Date.now(); // Fallback
    }
  }
  next();
});

export default mongoose.model("FormSubmission", formSubmissionSchema);
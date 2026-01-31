import mongoose from "mongoose";

const approvalHistorySchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  level: { type: Number, required: true },
  status: { type: String, enum: ["APPROVED", "REJECTED"], required: true },
  comments: String,
  actionedAt: { type: Date, default: Date.now }
});

const formSubmissionSchema = new mongoose.Schema({
  // Core identifiers
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
  formName: { type: String, required: true },
  
  // Submission metadata
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  submittedByName: { type: String, required: true },
  submittedByEmail: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  
  // Data and status
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  files: [{
    fieldId: String,
    filename: String,
    originalName: String,
    url: String,
    mimetype: String,
    size: Number
  }],
  
  status: { 
    type: String, 
    enum: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED"], 
    default: "DRAFT" 
  },
  
  // Approval workflow
  currentLevel: { type: Number, default: 0 },
  approvalHistory: [approvalHistorySchema],
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  // Organization context
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", required: true },
  
  // Tracking
  numericalId: { type: Number, unique: true },
  isArchived: { type: Boolean, default: false }
  
}, { 
  timestamps: true 
});

// Indexes for performance
formSubmissionSchema.index({ formId: 1, status: 1 });
formSubmissionSchema.index({ submittedBy: 1 });
formSubmissionSchema.index({ companyId: 1, status: 1 });
formSubmissionSchema.index({ plantId: 1, status: 1 });
formSubmissionSchema.index({ status: 1 });
formSubmissionSchema.index({ submittedAt: -1 });
formSubmissionSchema.index({ currentLevel: 1, status: 1 });

// Auto-generate numerical ID
formSubmissionSchema.pre('save', async function(next) {
  if (!this.numericalId && this.isNew) {
    try {
      const FormSubmissionModel = mongoose.model('FormSubmission');
      const maxSubmission = await FormSubmissionModel.findOne({}, {}, { sort: { numericalId: -1 } });
      this.numericalId = maxSubmission && maxSubmission.numericalId ? maxSubmission.numericalId + 1 : 1000;
    } catch (err) {
      console.error('Error generating numerical ID:', err);
      this.numericalId = Date.now();
    }
  }
  next();
});

export default mongoose.model("FormSubmission", formSubmissionSchema);
import mongoose from "mongoose";

const formSubmissionSchema = new mongoose.Schema({
  templateId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    index: true,
    refPath: 'templateModel'
  },
  templateModel: {
    type: String,
    required: true,
    enum: ['FormTemplate', 'Form'],
    default: 'FormTemplate'
  },
  templateName: { type: String }, // Snapshot of template name at time of submission
  numericalId: { type: Number, unique: true, sparse: true },
  formNumericalId: { type: Number, index: true }, // Reference to form's numerical ID
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", index: true },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: "Plant", index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  files: [{
    fieldId: String,
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  status: { 
    type: String, 
    enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SUBMITTED"], 
    default: "PENDING_APPROVAL",
    index: true
  },
  currentLevel: { type: Number, default: 1 },
  approvalHistory: [{
    level: { type: Number },
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["APPROVED", "REJECTED", "SUBMITTED"] },
    comments: { type: String },
    actionedAt: { type: Date, default: Date.now }
  }],
  submittedAt: { type: Date, default: Date.now, index: true },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

// Generate numerical ID before saving
formSubmissionSchema.pre('save', async function(next) {
  if (!this.numericalId && this.isNew) {
    try {
      const FormSubmissionModel = mongoose.model('FormSubmission');
      const maxSubmission = await FormSubmissionModel.findOne().sort({ numericalId: -1 });
      this.numericalId = maxSubmission && maxSubmission.numericalId ? maxSubmission.numericalId + 1 : 1;
      
      // Also store form's numerical ID if available
      if (this.templateId && this.templateModel === 'Form') {
        const FormModel = mongoose.model('Form');
        const form = await FormModel.findById(this.templateId);
        if (form && form.numericalId) {
          this.formNumericalId = form.numericalId;
        }
      }
    } catch (err) {
      console.error('Error generating numerical ID:', err);
      this.numericalId = Date.now(); // Fallback
    }
  }
  next();
});

export default mongoose.model("FormSubmission", formSubmissionSchema);

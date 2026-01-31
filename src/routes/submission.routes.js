import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  updateSubmission,
  deleteSubmission,
  submitDraft,
  getSubmissionStats
} from "../controllers/submission.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads/");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept common file types
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files
  }
});

// Routes

// Create new submission (with file upload support)
router.post("/", auth, authorize(["EMPLOYEE"]), upload.array("files", 10), createSubmission);

// Get all submissions (with filtering and pagination)
router.get("/", auth, authorize(["EMPLOYEE", "PLANT_ADMIN", "COMPANY_ADMIN"]), getSubmissions);

// Get submission statistics
router.get("/stats", auth, authorize(["EMPLOYEE", "PLANT_ADMIN", "COMPANY_ADMIN"]), getSubmissionStats);

// Get single submission
router.get("/:id", auth, authorize(["EMPLOYEE", "PLANT_ADMIN", "COMPANY_ADMIN"]), getSubmissionById);

// Update submission (only for drafts)
router.put("/:id", auth, authorize(["EMPLOYEE"]), updateSubmission);

// Submit draft submission
router.patch("/:id/submit", auth, authorize(["EMPLOYEE"]), submitDraft);

// Delete submission (only drafts)
router.delete("/:id", auth, authorize(["EMPLOYEE"]), deleteSubmission);

export default router;
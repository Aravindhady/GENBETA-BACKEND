import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import {
  createSubmission,
    getSubmissions,
    getSubmissionById,
    updateStatus as updateSubmissionStatus,
    getTemplateAnalytics
  } from "../controllers/submission.controller.js";
import { auth as authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads/"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept all file types, you can add restrictions here
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Create uploads directory if it doesn't exist
import fs from "fs";
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.post("/", authenticate, upload.any(), createSubmission);
router.get("/", authenticate, getSubmissions);
router.get("/template/:templateId/analytics", authenticate, getTemplateAnalytics);
router.get("/:id", authenticate, getSubmissionById);
router.patch("/:id/status", authenticate, updateSubmissionStatus);

export default router;


import express from "express";
import multer from "multer";
import { 
  getAssignedTasks, 
  getTaskStats, 
  submitTask, 
  getTaskById,
  submitFormDirectly,
  createTasks
} from "../controllers/formTask.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const router = express.Router();

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for form data with file support
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files
  }
});

router.get("/assigned", auth, authorize(["EMPLOYEE"]), getAssignedTasks);
router.get("/stats", auth, authorize(["EMPLOYEE"]), getTaskStats);
router.post("/", auth, authorize(["PLANT_ADMIN"]), createTasks);
router.post("/submit-direct/:formId", auth, authorize(["EMPLOYEE"]), upload.any(), submitFormDirectly);
router.get("/:taskId", auth, authorize(["EMPLOYEE"]), getTaskById);
router.post("/:taskId/submit", auth, authorize(["EMPLOYEE"]), upload.any(), submitTask);

export default router;

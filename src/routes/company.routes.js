import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  createCompany,
  createCompanyWithPlantsAdmin,
  getCompanies,
  getMyCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  updateCompanyPlan,
  updateTemplateFeature
} from "../controllers/company.controller.js";

import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

import { uploadToCloudinary } from "../utils/cloudinary.js";

const router = express.Router();

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post("/upload-logo", auth, authorize(["SUPER_ADMIN"]), upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    
    const result = await uploadToCloudinary(req.file.buffer);
    res.json({ logoUrl: result.secure_url });
  } catch (error) {
    console.error("Logo upload error:", error);
    res.status(500).json({ message: "Failed to upload logo to Cloudinary" });
  }
});

router.post("/", auth, authorize(["SUPER_ADMIN"]), createCompany);
router.post("/create-with-plants-admin", auth, authorize(["SUPER_ADMIN"]), createCompanyWithPlantsAdmin);
router.get("/", auth, authorize(["SUPER_ADMIN"]), getCompanies);
router.get("/my-company", auth, authorize(["COMPANY_ADMIN"]), getMyCompany);
router.get("/:id", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN"]), getCompanyById);
// Specific routes MUST come before /:id or "template-feature" is matched as id and causes 500
router.put("/template-feature", auth, authorize(["SUPER_ADMIN"]), updateTemplateFeature);
router.put("/:id", auth, authorize(["SUPER_ADMIN"]), upload.single("logo"), updateCompany);
router.put("/:id/plan", auth, authorize(["SUPER_ADMIN"]), updateCompanyPlan);
router.delete("/:id", auth, authorize(["SUPER_ADMIN"]), deleteCompany);

export default router;

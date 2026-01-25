import express from "express";
import {
  createTemplate,
  getTemplates,
  getTemplateById,
    updateTemplate,
    deleteTemplate,
    archiveTemplate,
    restoreTemplate
  } from "../controllers/template.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = express.Router();

router.post("/", auth, authorize(["PLANT_ADMIN"]), createTemplate);
router.get("/", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN"]), getTemplates);
router.get("/:id", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN"]), getTemplateById);
router.put("/:id", auth, authorize(["PLANT_ADMIN"]), updateTemplate);
router.delete("/:id", auth, authorize(["PLANT_ADMIN"]), deleteTemplate);
router.patch("/:id/archive", auth, authorize(["PLANT_ADMIN"]), archiveTemplate);
router.patch("/:id/restore", auth, authorize(["PLANT_ADMIN"]), restoreTemplate);

export default router;

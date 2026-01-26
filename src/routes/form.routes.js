import express from "express";
import {
  createForm,
  getForms,
  getFormById,
  updateForm,
  deleteForm,
  archiveForm,
  restoreForm
} from "../controllers/form.controller.js";
import { sendLink } from "../controllers/approval.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = express.Router();

router.post("/", auth, authorize(["PLANT_ADMIN"]), createForm);
router.get("/", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN", "EMPLOYEE"]), getForms);
router.get("/:id", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN", "EMPLOYEE"]), getFormById);
router.put("/:id", auth, authorize(["PLANT_ADMIN"]), updateForm);
router.delete("/:id", auth, authorize(["PLANT_ADMIN"]), deleteForm);

router.post("/:id/send-link", auth, authorize(["PLANT_ADMIN"]), sendLink);

// Archive/Restore routes
router.patch("/:id/archive", auth, authorize(["PLANT_ADMIN"]), archiveForm);
router.patch("/:id/restore", auth, authorize(["PLANT_ADMIN"]), restoreForm);

export default router;

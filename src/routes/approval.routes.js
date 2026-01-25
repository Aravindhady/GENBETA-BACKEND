import express from "express";
import { 
  getFormByToken, 
  submitFormByToken, 
  sendMultiFormLink,
  getAssignedSubmissions,
  processApproval,
  getEmployeeStats,
  createApprovalTask,
  getApprovalTasks,
  getApprovalTaskDetails
} from "../controllers/approval.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = express.Router();

// Internal Approval Tasks (MUST be before /:token routes)
router.post("/tasks", auth, authorize(["PLANT_ADMIN"]), createApprovalTask);
router.get("/tasks", auth, authorize(["EMPLOYEE", "PLANT_ADMIN"]), getApprovalTasks);
router.get("/tasks/:id", auth, authorize(["EMPLOYEE", "PLANT_ADMIN"]), getApprovalTaskDetails);

// Employee workflow (MUST be before /:token routes)
router.get("/assigned/all", auth, authorize(["EMPLOYEE", "PLANT_ADMIN"]), getAssignedSubmissions);
router.post("/process", auth, authorize(["EMPLOYEE", "PLANT_ADMIN"]), processApproval);
router.get("/stats/employee", auth, authorize(["EMPLOYEE", "PLANT_ADMIN"]), getEmployeeStats);

// External links
router.post("/send-multi", auth, authorize(["PLANT_ADMIN"]), sendMultiFormLink);

// Token-based routes (MUST be last - catch-all)
router.get("/:token", getFormByToken);
router.post("/:token", submitFormByToken);

export default router;

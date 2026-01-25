import express from "express";
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

const router = express.Router();

router.get("/assigned", auth, authorize(["EMPLOYEE"]), getAssignedTasks);
router.get("/stats", auth, authorize(["EMPLOYEE"]), getTaskStats);
router.post("/", auth, authorize(["PLANT_ADMIN"]), createTasks);
router.post("/submit-direct/:formId", auth, authorize(["EMPLOYEE"]), submitFormDirectly);
router.get("/:taskId", auth, authorize(["EMPLOYEE"]), getTaskById);
router.post("/:taskId/submit", auth, authorize(["EMPLOYEE"]), submitTask);

export default router;

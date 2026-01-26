import express from "express";
import { updateAdmin, createEmployee, getPlantEmployees, getProfile, updateProfile, updateEmployee, deleteEmployee, getUsers } from "../controllers/user.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = express.Router();

/* ======================================================
   USER MANAGEMENT
====================================================== */
router.get(
  "/",
  auth,
  authorize(["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN"]),
  getUsers
);

/* ======================================================
   PROFILE MANAGEMENT
====================================================== */
router.get(
  "/profile",
  auth,
  getProfile
);

router.put(
  "/profile",
  auth,
  updateProfile
);

/* ======================================================
   EMPLOYEE MANAGEMENT
====================================================== */
router.post(
  "/employees",
  auth,
  authorize(["PLANT_ADMIN"]),
  createEmployee
);

router.get(
  "/plant/:plantId/employees",
  auth,
  authorize(["PLANT_ADMIN", "COMPANY_ADMIN"]),
  getPlantEmployees
);

router.put(
  "/:id",
  auth,
  authorize(["SUPER_ADMIN", "PLANT_ADMIN"]),
  updateEmployee
);

router.delete(
  "/:id",
  auth,
  authorize(["SUPER_ADMIN", "PLANT_ADMIN"]),
  deleteEmployee
);

export default router;
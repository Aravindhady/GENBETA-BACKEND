import express from "express";
import { createPlant, updatePlant, getPlants, deletePlant, getMyPlant, updatePlantTemplateFeature } from "../controllers/plant.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = express.Router();

router.get("/my-plant", auth, authorize(["PLANT_ADMIN"]), getMyPlant);
router.get("/", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN", "PLANT_ADMIN"]), getPlants);
router.post("/", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN"]), createPlant);
// Specific route MUST come before /:id or "template-feature" is matched as id and causes 500
router.put("/template-feature", auth, authorize(["SUPER_ADMIN"]), updatePlantTemplateFeature);
router.put("/:id", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN"]), updatePlant);
router.delete("/:id", auth, authorize(["SUPER_ADMIN", "COMPANY_ADMIN"]), deletePlant);

export default router;

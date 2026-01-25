import express from "express";
import { auth } from "../middlewares/auth.middleware.js";
import { 
  getPlans, 
  getSubscriptionStatus, 
  updateSubscription, 
  getUsageLimits 
} from "../controllers/subscription.controller.js";

const router = express.Router();

router.get("/plans", getPlans);

router.get("/status", auth, getSubscriptionStatus);

router.post("/update", auth, updateSubscription);

router.get("/usage", auth, getUsageLimits);
router.get("/usage/:companyId", auth, getUsageLimits);

export default router;

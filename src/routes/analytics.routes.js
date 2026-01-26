import express from "express";
import {
  getSubmissionsPerDay,
  getAverageApprovalTime,
  getRejectionRate,
    getPendingByStage,
    getPlantWiseStats,
    getDashboardAnalytics,
    getApprovalsByEmployee,
    getSuperAdminAnalytics,
    getApproversPerformance,
    getApproversWorkload
  } from "../controllers/analytics.controller.js";
    import { auth as authenticate, checkRole } from "../middlewares/auth.middleware.js";
    
    const router = express.Router();
    
    // All analytics routes require authentication
    router.use(authenticate);
    
    router.get("/super-admin", checkRole(["SUPER_ADMIN"]), getSuperAdminAnalytics);
    router.get("/dashboard", getDashboardAnalytics);
    router.get("/submissions-per-day", getSubmissionsPerDay);

  router.get("/average-approval-time", getAverageApprovalTime);
  router.get("/rejection-rate", getRejectionRate);
  router.get("/pending-by-stage", getPendingByStage);
  router.get("/plant-wise-stats", getPlantWiseStats);
  router.get("/approvals-by-employee", getApprovalsByEmployee);
  router.get("/approvers-performance", getApproversPerformance);
  router.get("/approvers-workload", getApproversWorkload);
  
  export default router;


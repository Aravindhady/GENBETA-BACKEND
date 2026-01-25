import Company from "../models/Company.model.js";
import { getAllPlans, getPlanById, PLANS } from "../config/plans.js";
import { getCompanySubscriptionDetails } from "../utils/planLimits.js";

export const getPlans = async (req, res) => {
  try {
    const plans = getAllPlans();
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error("Get plans error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch plans" });
  }
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID not found" });
    }

    const details = await getCompanySubscriptionDetails(companyId);
    if (!details) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    res.json({ success: true, data: details });
  } catch (error) {
    console.error("Get subscription status error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch subscription status" });
  }
};

export const updateSubscription = async (req, res) => {
  try {
    const { companyId, plan, billingCycle } = req.body;

    const targetCompanyId = companyId || req.user.companyId;
    
    if (!targetCompanyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const normalizedPlan = plan?.toUpperCase();
    if (!PLANS[normalizedPlan]) {
      return res.status(400).json({ success: false, message: "Invalid plan selected" });
    }

    const endDate = new Date();
    if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const updated = await Company.findByIdAndUpdate(
      targetCompanyId,
      {
        "subscription.plan": normalizedPlan,
        "subscription.startDate": new Date(),
        "subscription.endDate": endDate,
        "subscription.billingCycle": billingCycle || "monthly",
        "subscription.isActive": true
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    const planDetails = getPlanById(normalizedPlan);

    res.json({
      success: true,
      message: `Successfully upgraded to ${planDetails.name} plan`,
      data: {
        plan: planDetails,
        subscription: updated.subscription
      }
    });
  } catch (error) {
    console.error("Update subscription error:", error);
    res.status(500).json({ success: false, message: "Failed to update subscription" });
  }
};

export const getUsageLimits = async (req, res) => {
  try {
    const companyId = req.params.companyId || req.user.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const details = await getCompanySubscriptionDetails(companyId);
    if (!details) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    res.json({ 
      success: true, 
      data: {
        limits: details.limits,
        usage: details.usage,
        plantUsage: details.plantUsage,
        plan: details.plan
      }
    });
  } catch (error) {
    console.error("Get usage limits error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch usage limits" });
  }
};

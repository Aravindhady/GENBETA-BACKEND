export const PLANS = {
  SILVER: {
    id: "silver",
    name: "Silver",
    description: "Perfect for small businesses getting started",
    price: 49,
    priceYearly: 490,
    limits: {
      maxPlants: 2,
      maxFormsPerPlant: 10,
      maxEmployeesPerPlant: 10,
      approvalLevels: 2,
    },
    features: {
      dashboard: "basic",
      approvalWorkflow: "limited",
      analytics: false,
      prioritySupport: false,
      customBranding: false,
    },
    displayFeatures: [
      "Up to 2 Plants",
      "10 Forms per Plant",
      "10 Employees per Plant",
      "2-Level Approval Workflow",
      "Basic Dashboard",
      "Email Support",
    ],
  },

  GOLD: {
    id: "gold",
    name: "Gold",
    description: "Ideal for growing companies with multiple units",
    price: 99,
    priceYearly: 990,
    limits: {
      maxPlants: 5,
      maxFormsPerPlant: 25,
      maxEmployeesPerPlant: 50,
      approvalLevels: 5,
    },
    features: {
      dashboard: "advanced",
      approvalWorkflow: "multi-level",
      analytics: true,
      prioritySupport: false,
      customBranding: true,
    },
    displayFeatures: [
      "Up to 5 Plants",
      "25 Forms per Plant",
      "50 Employees per Plant",
      "5-Level Approval Workflow",
      "Advanced Dashboard",
      "Plant-wise Analytics",
      "Custom Branding",
      "Priority Email Support",
    ],
    popular: true,
  },

  PREMIUM: {
    id: "premium",
    name: "Premium",
    description: "Enterprise-grade solution for large organizations",
    price: 199,
    priceYearly: 1990,
    limits: {
      maxPlants: -1,
      maxFormsPerPlant: -1,
      maxEmployeesPerPlant: -1,
      approvalLevels: -1,
    },
    features: {
      dashboard: "enterprise",
      approvalWorkflow: "unlimited",
      analytics: true,
      prioritySupport: true,
      customBranding: true,
    },
    displayFeatures: [
      "Unlimited Plants",
      "Unlimited Forms",
      "Unlimited Employees",
      "Unlimited Approval Levels",
      "Company-wide Dashboard",
      "Advanced Analytics & Reports",
      "Custom Branding",
      "24/7 Priority Support",
      "Dedicated Account Manager",
    ],
    },
    CUSTOM: {
      id: "custom",
      name: "Custom Plan",
      description: "Tailored plan for specific business needs",
      price: 0,
      priceYearly: 0,
      limits: {
        maxPlants: 0,
        maxFormsPerPlant: 0,
        maxEmployeesPerPlant: 0,
        approvalLevels: 0,
      },
      features: {
        dashboard: "advanced",
        approvalWorkflow: "multi-level",
        analytics: true,
        prioritySupport: true,
        customBranding: true,
      },
      displayFeatures: [
        "Customized Plant Limit",
        "Customized Form Limit",
        "Customized Employee Limit",
        "Advanced Dashboard",
        "Analytics & Reports",
        "Custom Branding",
        "Priority Support",
      ],
    },
  };

export const DEFAULT_PLAN = "SILVER";

export const getPlanById = (planId) => {
  const normalizedId = planId?.toUpperCase();
  return PLANS[normalizedId] || PLANS[DEFAULT_PLAN];
};

export const getPlanLimits = (planId) => {
  const plan = getPlanById(planId);
  return plan.limits;
};

export const isUnlimited = (value) => value === -1;

export const checkLimit = (currentCount, limit) => {
  if (isUnlimited(limit)) return true;
  return currentCount < limit;
};

export const getAllPlans = () => {
  return Object.entries(PLANS).map(([key, plan]) => ({
    ...plan,
    key,
  }));
};

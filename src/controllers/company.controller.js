import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import User from "../models/User.model.js";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail, sendPlantCreatedEmail } from "../services/email.service.js";

import { uploadToCloudinary } from "../utils/cloudinary.js";
import { generateCacheKey, getFromCache, setInCache } from "../utils/cache.js";

/* 🔹 Helper: Generate Plant Code */
const generatePlantCode = () =>
  "PLT-" + Math.random().toString(36).substring(2, 7).toUpperCase();

/* ======================================================
   CREATE COMPANY + INITIAL PLANTS + ADMIN
====================================================== */
    export const createCompanyWithPlantsAdmin = async (req, res) => {
      try {
        const { company, plants, admin, plan, customLimits } = req.body;


    if (!company || !plants || !admin) {
      return res.status(400).json({ message: "Missing required data (company, plants, or admin)" });
    }

    // Check if primary admin email already exists
    const existingAdmin = await User.findOne({ email: admin.email });
    if (existingAdmin) {
      return res.status(400).json({ message: `Admin email ${admin.email} is already in use` });
    }

    // Check if any plant admin emails already exist
    for (const p of plants) {
      if (p.adminEmail) {
        const existingPlantAdmin = await User.findOne({ email: p.adminEmail });
        if (existingPlantAdmin) {
          return res.status(400).json({ message: `Plant admin email ${p.adminEmail} is already in use` });
        }
      }
    }

    const selectedPlan = plan || "SILVER";

    const newCompany = await Company.create({
      name: company.companyName || company.name,
      industry: company.industry,
      contactEmail: company.contactEmail,
      address: company.address,
      contactPhone: company.contactPhone,
      gstNumber: company.gstNumber,
      logoUrl: company.logoUrl,
      subscription: {
        plan: selectedPlan,
        startDate: new Date(),
        billingCycle: "manual",
        customLimits: selectedPlan === "CUSTOM" ? customLimits : undefined
      }
    });

    // Create multiple plants and their admins if provided
    const createdPlants = await Promise.all(
      plants.map(async (p) => {
        const plant = await Plant.create({
          companyId: newCompany._id,
          name: p.plantName || p.name,
          plantNumber: p.plantNumber,
          location: p.location,
          code: p.code || generatePlantCode(),
        });

        // Create Plant Admin if details are provided
        if (p.adminEmail && p.adminPassword && p.adminName) {
          const plantHashedPassword = await bcrypt.hash(p.adminPassword, 10);
          await User.create({
            companyId: newCompany._id,
            plantId: plant._id,
            name: p.adminName,
            email: p.adminEmail,
            password: plantHashedPassword,
            role: "PLANT_ADMIN",
          });
          
          const loginUrl = process.env.CLIENT_URL || "http://localhost:5173/login";
          sendWelcomeEmail(
            p.adminEmail,
            p.adminName,
            "PLANT_ADMIN",
            newCompany.name,
            loginUrl,
            p.adminPassword
          ).catch(err => console.error("Failed to send plant admin welcome email:", err));
        }

        return plant;
      })
    );

    if (createdPlants.length === 0) {
      throw new Error("At least one plant must be created");
    }

    const hashedPassword = await bcrypt.hash(admin.password, 10);

    // Primary admin is associated with the company and the first plant
    await User.create({
      companyId: newCompany._id,
      plantId: createdPlants[0]._id,
      name: admin.name,
      email: admin.email,
      password: hashedPassword,
      role: "COMPANY_ADMIN",
    });

    const loginUrl = process.env.CLIENT_URL || "http://localhost:5173/login";
    sendWelcomeEmail(
      admin.email,
      admin.name,
      "COMPANY_ADMIN",
      newCompany.name,
      loginUrl,
      admin.password
    ).catch(err => console.error("Failed to send company admin welcome email:", err));

    res.status(201).json({
      message: "Company, plants, and admin created successfully",
      companyId: newCompany._id
    });
  } catch (error) {
    console.error("Create company error:", error);
    res.status(500).json({ message: error.message || "Failed to create company" });
  }
};

/* ======================================================
   CREATE COMPANY + INITIAL PLANT + ADMIN (Legacy)
====================================================== */
export const createCompany = async (req, res) => {
  try {
    const { company, plant, admin } = req.body;

    const newCompany = await Company.create({
      name: company.companyName || company.name,
      industry: company.industry,
      contactEmail: company.contactEmail,
      address: company.address,
      contactPhone: company.contactPhone,
      gstNumber: company.gstNumber,
      logoUrl: company.logoUrl,
    });

    const newPlant = await Plant.create({
      companyId: newCompany._id,
      name: plant.plantName || plant.name,
      plantNumber: plant.plantNumber,
      location: plant.location,
      code: plant.code || generatePlantCode()
    });

    const hashedPassword = await bcrypt.hash(admin.password, 10);

    await User.create({
      companyId: newCompany._id,
      plantId: newPlant._id,
      name: admin.name,
      email: admin.email,
      password: hashedPassword,
      role: "COMPANY_ADMIN"
    });

    const loginUrl = process.env.CLIENT_URL || "http://localhost:5173/login";
    sendWelcomeEmail(
      admin.email,
      admin.name,
      "COMPANY_ADMIN",
      newCompany.name,
      loginUrl,
      admin.password
    ).catch(err => console.error("Failed to send welcome email:", err));

    res.status(201).json({
      message: "Company, plant, and admin created successfully",
      companyId: newCompany._id
    });
  } catch (error) {
    console.error("Create company error:", error);
    res.status(500).json({ message: error.message || "Failed to create company" });
  }
};

/* ======================================================
   GET ALL COMPANIES
====================================================== */
export const getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Generate cache key
    const cacheKey = generateCacheKey('companies', { page, limit });
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Count total companies for pagination metadata
    const total = await Company.countDocuments({ isActive: true });

    // Get paginated companies
    const companies = await Company.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Process companies with additional data
    const data = await Promise.all(
      companies.map(async (company) => {
        const plantsCount = await Plant.countDocuments({ companyId: company._id, isActive: true });
        const admin = await User.findOne({ companyId: company._id, role: "COMPANY_ADMIN" }).select("name email");

        return {
          ...company.toObject(),
          id: company._id,
          plantsCount,
          adminName: admin?.name || "N/A",
          adminEmail: admin?.email || "N/A"
        };
      })
    );
    
    const result = {
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
    
    // Cache the result for 5 minutes
    await setInCache(cacheKey, result, 300);

    res.json(result);
  } catch (error) {
    console.error("Get companies error:", error);
    res.status(500).json({ message: "Failed to fetch companies" });
  }
};

/* ======================================================
   GET MY COMPANY (For Company Admin)
====================================================== */
export const getMyCompany = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ message: "No company associated with this user" });
    }

    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const plants = await Plant.find({ companyId: company._id, isActive: true });
    const admins = await User.find({ companyId: company._id, role: "COMPANY_ADMIN" }).select("-password");

    res.json({
      ...company.toObject(),
      plants,
      admins
    });
  } catch (error) {
    console.error("Get my company error:", error);
    res.status(500).json({ message: "Failed to fetch company details" });
  }
};

/* ======================================================
   GET SINGLE COMPANY
====================================================== */
export const getCompanyById = async (req, res) => {
  try {
    console.log("Fetching company with ID:", req.params.id);
    const company = await Company.findById(req.params.id);
    if (!company) {
      console.log("Company not found in DB for ID:", req.params.id);
      return res.status(404).json({ message: "Company not found" });
    }

    const plants = await Plant.find({ companyId: company._id, isActive: true });
    const admins = await User.find({ companyId: company._id, role: "COMPANY_ADMIN" }).select("-password");

    res.json({
      ...company.toObject(),
      plants,
      admins
    });
  } catch (error) {
    console.error("Get company by id error:", error);
    res.status(500).json({ message: "Failed to fetch company" });
  }
};

/* ======================================================
   UPDATE COMPANY
====================================================== */
export const updateCompany = async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Handle logo if uploaded via multer (now using Cloudinary)
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      updateData.logoUrl = result.secure_url;
    }

    const updated = await Company.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json({
      message: "Company updated successfully",
      updated
    });
  } catch (error) {
    console.error("Update company error:", error);
    res.status(500).json({ message: "Update failed" });
  }
};

/* ======================================================
   DELETE COMPANY (SOFT DELETE)
====================================================== */
export const deleteCompany = async (req, res) => {
  try {
    await Company.findByIdAndUpdate(req.params.id, {
      isActive: false
    });

    res.json({ message: "Company removed successfully" });
  } catch (error) {
    console.error("Delete company error:", error);
    res.status(500).json({ message: "Delete failed" });
  }
};

/* ======================================================
   UPDATE COMPANY PLAN (Super Admin Only)
====================================================== */
export const updateTemplateFeature = async (req, res) => {
  try {
    const { companyId, enabled } = req.body;
    
    if (companyId) {
      // Update company-level setting
      const company = await Company.findByIdAndUpdate(
        companyId,
        { templateFeatureEnabled: enabled },
        { new: true }
      );
      
      if (!company) {
        return res.status(404).json({ success: false, message: "Company not found" });
      }
      
      // If disabling at company level, also disable for all plants
      if (!enabled) {
        await Plant.updateMany(
          { companyId: company._id },
          { templateFeatureEnabled: false }
        );
      }
      
      return res.json({
        success: true,
        message: `Template feature ${enabled ? 'enabled' : 'disabled'} for company`,
        company
      });
    }
    
    return res.status(400).json({ success: false, message: "Company ID required" });
  } catch (error) {
    console.error("Update template feature error:", error);
    res.status(500).json({ success: false, message: "Failed to update template feature" });
  }
};

export const updateCompanyPlan = async (req, res) => {
  try {
    const { plan, customLimits } = req.body;
    const validPlans = ["SILVER", "GOLD", "PREMIUM", "CUSTOM"];
    
    if (!plan || !validPlans.includes(plan.toUpperCase())) {
      return res.status(400).json({ message: "Invalid plan. Choose from: Silver, Gold, Premium, Custom" });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const normalizedPlan = plan.toUpperCase();
    
    company.subscription = {
      ...company.subscription,
      plan: normalizedPlan,
      startDate: company.subscription?.startDate || new Date(),
      billingCycle: "manual",
      customLimits: normalizedPlan === "CUSTOM" ? customLimits : undefined
    };

    await company.save();

    res.json({ 
      message: `Plan updated to ${plan} successfully`,
      subscription: company.subscription
    });
  } catch (error) {
    console.error("Update plan error:", error);
    res.status(500).json({ message: "Failed to update plan" });
  }
};

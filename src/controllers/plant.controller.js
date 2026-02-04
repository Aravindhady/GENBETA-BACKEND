import Plant from "../models/Plant.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import bcrypt from "bcryptjs";
import { validatePlantCreation } from "../utils/planLimits.js";
import { sendWelcomeEmail, sendPlantCreatedEmail } from "../services/email.service.js";
import { generateCacheKey, getFromCache, setInCache } from "../utils/cache.js";

const generatePlantCode = () =>
  "PLT-" + Math.random().toString(36).substring(2, 7).toUpperCase();

export const createPlant = async (req, res) => {
  try {
    const { name, location, plantNumber, admin, companyId } = req.body;

    const targetCompanyId = req.user.role === "SUPER_ADMIN" ? companyId : req.user.companyId;

    if (!targetCompanyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const validation = await validatePlantCreation(targetCompanyId);
    if (!validation.allowed) {
      return res.status(403).json({ 
        message: validation.message,
        upgradeRequired: validation.upgradeRequired,
        currentCount: validation.currentCount,
        limit: validation.limit
      });
    }

    const company = await Company.findById(targetCompanyId);
    const companyName = company?.name || "Unknown Company";

    const plant = await Plant.create({
      companyId: targetCompanyId,
      name,
      location,
      plantNumber,
      code: generatePlantCode()
    });

    const companyAdmin = await User.findOne({ companyId: targetCompanyId, role: "COMPANY_ADMIN" });
    if (companyAdmin) {
      sendPlantCreatedEmail(
        companyAdmin.email,
        plant.name,
        plant.code,
        companyName,
        company,
        plant
      ).catch(err => console.error("Failed to send plant created email:", err));
    }

    if (admin) {
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      await User.create({
        companyId: targetCompanyId,
        plantId: plant._id,
        name: admin.name,
        email: admin.email,
        password: hashedPassword,
        role: "PLANT_ADMIN"
      });

      const loginUrl = process.env.CLIENT_URL || "http://localhost:5173/login";
      sendWelcomeEmail(
        admin.email,
        admin.name,
        "PLANT_ADMIN",
        companyName,
        loginUrl,
        admin.password,
        company
      ).catch(err => console.error("Failed to send plant admin welcome email:", err));
    }

    res.status(201).json({
      message: "Plant and admin created successfully",
      plant
    });
  } catch (error) {
    console.error("Create plant error:", error);
    res.status(500).json({ message: "Failed to create plant" });
  }
};

/* ======================================================
   GET PLANTS
====================================================== */
export const getPlants = async (req, res) => {
  try {
    const filter = { isActive: true };
    
    if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === "PLANT_ADMIN") {
      filter._id = req.user.plantId;
    } else if (req.user.role === "SUPER_ADMIN" && req.query.companyId) {
      filter.companyId = req.query.companyId;
    }

    // Handle pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Generate cache key
    const cacheParams = { page, limit };
    if (filter.companyId) cacheParams.companyId = filter.companyId;
    if (filter._id) cacheParams.plantId = filter._id;
    const cacheKey = generateCacheKey('plants', cacheParams);
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Count total plants for pagination metadata
    const total = await Plant.countDocuments(filter);

    // Get paginated plants with company data
    const plants = await Plant.find(filter)
      .populate('companyId', 'name logoUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const data = await Promise.all(
      plants.map(async (plant) => {
        const admin = await User.findOne({ plantId: plant._id, role: "PLANT_ADMIN" }).select("name email");
        return {
          ...plant.toObject(),
          company: plant.companyId,
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
    console.error("Get plants error:", error);
    res.status(500).json({ message: "Failed to fetch plants" });
  }
};

/* ======================================================
   UPDATE PLANT
====================================================== */
export const updatePlant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, admin } = req.body;
    
    // Find the plant to verify ownership
    const plant = await Plant.findById(id);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    
    // Check authorization - SUPER_ADMIN can update any plant, COMPANY_ADMIN can only update plants in their company, PLANT_ADMIN can only update their own plant
    if (req.user.role === "COMPANY_ADMIN" && plant.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ message: "Unauthorized to update this plant" });
    }
    
    if (req.user.role === "PLANT_ADMIN" && plant._id.toString() !== req.user.plantId.toString()) {
      return res.status(403).json({ message: "Unauthorized to update this plant" });
    }
    
    // Update plant information
    const updateData = {};
    if (name) updateData.name = name;
    if (location) updateData.location = location;
    
    const updatedPlant = await Plant.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    // Update plant admin information if provided
    if (admin) {
      const { name: adminName, email: adminEmail, password: adminPassword } = admin;
      
      if (adminName || adminEmail || adminPassword) {
        const updateAdminData = {};
        if (adminName) updateAdminData.name = adminName;
        if (adminEmail) updateAdminData.email = adminEmail;
        
        // Update password only if provided
        if (adminPassword) {
          const hashedPassword = await bcrypt.hash(adminPassword, 10);
          updateAdminData.password = hashedPassword;
        }
        
        await User.findOneAndUpdate(
          { plantId: id, role: "PLANT_ADMIN" },
          updateAdminData,
          { new: true }
        );
      }
    }

    // Get the updated plant with admin info
    const updatedAdmin = await User.findOne({ plantId: id, role: "PLANT_ADMIN" }).select("name email");
    
    const result = {
      ...updatedPlant.toObject(),
      adminName: updatedAdmin?.name || "N/A",
      adminEmail: updatedAdmin?.email || "N/A"
    };

    res.json({
      message: "Plant updated successfully",
      plant: result
    });
  } catch (error) {
    console.error("Update plant error:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};

/* ======================================================
   DELETE PLANT (SOFT DELETE)
====================================================== */
export const deletePlant = async (req, res) => {
  try {
    await Plant.findByIdAndUpdate(req.params.id, {
      isActive: false
    });

    res.json({ message: "Plant removed successfully" });
  } catch (error) {
    console.error("Delete plant error:", error);
    res.status(500).json({ message: "Delete failed" });
  }
};

export const updatePlantTemplateFeature = async (req, res) => {
  try {
    const { plantId, enabled } = req.body;
    
    if (!plantId) {
      return res.status(400).json({ success: false, message: "Plant ID required" });
    }
    
    const plant = await Plant.findByIdAndUpdate(
      plantId,
      { templateFeatureEnabled: enabled },
      { new: true }
    );
    
    if (!plant) {
      return res.status(404).json({ success: false, message: "Plant not found" });
    }
    
    return res.json({
      success: true,
      message: `Template feature ${enabled ? 'enabled' : 'disabled'} for plant`,
      plant
    });
  } catch (error) {
    console.error("Update plant template feature error:", error);
    res.status(500).json({ success: false, message: "Failed to update template feature" });
  }
};

export const getPlantById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the plant
    const plant = await Plant.findById(id);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    
    // Check authorization - SUPER_ADMIN can access any plant, COMPANY_ADMIN can only access plants in their company, PLANT_ADMIN can only access their own plant
    if (req.user.role === "COMPANY_ADMIN" && plant.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ message: "Unauthorized to access this plant" });
    }
    
    if (req.user.role === "PLANT_ADMIN" && plant._id.toString() !== req.user.plantId.toString()) {
      return res.status(403).json({ message: "Unauthorized to access this plant" });
    }
    
    // Get the plant admin info
    const admin = await User.findOne({ plantId: id, role: "PLANT_ADMIN" }).select("name email");
    
    const result = {
      ...plant.toObject(),
      adminName: admin?.name || "N/A",
      adminEmail: admin?.email || "N/A"
    };
    
    res.json(result);
  } catch (error) {
    console.error("Get plant by ID error:", error);
    res.status(500).json({ message: "Failed to fetch plant", error: error.message });
  }
};

export const getMyPlant = async (req, res) => {
  try {
    const plant = await Plant.findById(req.user.plantId);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }

    const company = await Company.findById(plant.companyId);
    const employees = await User.find({ plantId: plant._id, role: "EMPLOYEE", isActive: true }).select("name email position");
    const plantAdmin = await User.findOne({ plantId: plant._id, role: "PLANT_ADMIN" }).select("name email phoneNumber position");

    res.json({
      plant: {
        ...plant.toObject(),
        templateFeatureEnabled: plant.templateFeatureEnabled
      },
      company: company ? {
        _id: company._id,
        name: company.name,
        logoUrl: company.logoUrl,
        industry: company.industry,
        contactEmail: company.contactEmail,
        contactPhone: company.contactPhone,
        address: company.address,
        templateFeatureEnabled: company.templateFeatureEnabled
      } : null,
      admin: plantAdmin,
      employees,
      employeeCount: employees.length
    });
  } catch (error) {
    console.error("Get my plant error:", error);
    res.status(500).json({ message: "Failed to fetch plant profile" });
  }
};

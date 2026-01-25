import Plant from "../models/Plant.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import bcrypt from "bcryptjs";
import { validatePlantCreation } from "../utils/planLimits.js";
import { sendWelcomeEmail, sendPlantCreatedEmail } from "../services/email.service.js";

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

    const plants = await Plant.find(filter).sort({ createdAt: -1 });
    
    const data = await Promise.all(
      plants.map(async (plant) => {
        const admin = await User.findOne({ plantId: plant._id, role: "PLANT_ADMIN" }).select("name email");
        return {
          ...plant.toObject(),
          adminName: admin?.name || "N/A",
          adminEmail: admin?.email || "N/A"
        };
      })
    );

    res.json(data);
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
    const updated = await Plant.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      message: "Plant updated successfully",
      updated
    });
  } catch (error) {
    console.error("Update plant error:", error);
    res.status(500).json({ message: "Update failed" });
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

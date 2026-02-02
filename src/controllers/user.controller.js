import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import bcrypt from "bcryptjs";
import { validateEmployeeCreation } from "../utils/planLimits.js";
import { sendWelcomeEmail } from "../services/email.service.js";
import Plant from "../models/Plant.model.js";
import { generateCacheKey, deleteFromCache } from "../utils/cache.js";

export const getUsers = async (req, res) => {
  try {
    const filter = { isActive: { $ne: false } };

    // Role-based filtering
    if (req.user.role === "PLANT_ADMIN") {
      filter.plantId = req.user.plantId;
    } else if (req.user.role === "COMPANY_ADMIN") {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === "SUPER_ADMIN") {
      // SUPER_ADMIN can see all users, but allow filtering by companyId or plantId
      if (req.query.companyId) filter.companyId = req.query.companyId;
      if (req.query.plantId) filter.plantId = req.query.plantId;
    } else {
      // Regular users can only see themselves
      filter._id = req.user.userId;
    }

    // Additional filters
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }

    const users = await User.find(filter)
      .populate("companyId", "name")
      .populate("plantId", "name");

    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate("companyId", "name logoUrl gstNumber address templateFeatureEnabled")
      .populate("plantId", "name plantNumber location code templateFeatureEnabled");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check template feature status
    let templateFeatureEnabled = false;
    if (user.plantId) {
      // If plant has explicit setting, use it; otherwise inherit from company
      if (user.plantId.templateFeatureEnabled !== null && user.plantId.templateFeatureEnabled !== undefined) {
        templateFeatureEnabled = user.plantId.templateFeatureEnabled;
      } else {
        templateFeatureEnabled = user.companyId?.templateFeatureEnabled || false;
      }
    } else if (user.companyId) {
      templateFeatureEnabled = user.companyId.templateFeatureEnabled || false;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phoneNumber: user.phoneNumber,
          position: user.position,
          permissions: user.permissions,
          companyId: user.companyId?._id || user.companyId,
          companyName: user.companyId?.name,
          companyLogo: user.companyId?.logoUrl,
          companyGst: user.companyId?.gstNumber,
          companyAddress: user.companyId?.address,
          plantId: user.plantId?._id || user.plantId,
          plantName: user.plantId?.name,
          plantNumber: user.plantId?.plantNumber,
          plantLocation: user.plantId?.location,
          plantCode: user.plantId?.code,
          templateFeatureEnabled: templateFeatureEnabled
        }
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email, phoneNumber, position } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (position) updateData.position = position;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true }
    );

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, position, companyId, plantId } = req.body;

    const targetCompanyId = companyId || req.user.companyId;
    const targetPlantId = plantId || req.user.plantId;

    const validation = await validateEmployeeCreation(targetCompanyId, targetPlantId);
    if (!validation.allowed) {
      return res.status(403).json({ 
        message: validation.message,
        upgradeRequired: validation.upgradeRequired,
        currentCount: validation.currentCount,
        limit: validation.limit
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: "EMPLOYEE",
      phoneNumber,
      position,
      companyId: targetCompanyId,
      plantId: targetPlantId,
      isActive: true
    });

    await newUser.save();

    // Invalidate cache for plant employees
    try {
      const cacheKey = generateCacheKey('plantEmployees', { plantId: targetPlantId });
      await deleteFromCache(cacheKey);
    } catch (cacheError) {
      console.error('Cache invalidation error:', cacheError);
    }

    // Send welcome email asynchronously (don't await it)
    try {
      const company = await Company.findById(targetCompanyId);
      const companyName = company ? company.name : "Your Company";
      const loginUrl = process.env.CLIENT_URL || "http://localhost:5173";
      
      // Don't await this - let it run in the background
      sendWelcomeEmail(
        email,
        name,
        "EMPLOYEE",
        companyName,
        loginUrl,
        password, // Send the raw password
        company
      ).catch(emailError => {
        console.error("Failed to send welcome email to employee:", emailError);
      });
    } catch (emailError) {
      console.error("Error preparing welcome email:", emailError);
      // Don't fail the request if email preparation fails
    }

    res.status(201).json({
      message: "Employee created successfully",
      employee: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        position: newUser.position
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create employee" });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const { name, email, position, phoneNumber } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (position) updateData.position = position;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Update employee error:", error);
    res.status(500).json({ success: false, message: "Failed to update employee" });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (user.role !== "EMPLOYEE") {
      return res.status(400).json({ message: "Cannot delete non-employee users" });
    }

    await User.findByIdAndUpdate(req.params.id, { isActive: false });

    res.json({ success: true, message: "Employee removed successfully" });
  } catch (error) {
    console.error("Delete employee error:", error);
    res.status(500).json({ success: false, message: "Failed to remove employee" });
  }
};

export const getPlantEmployees = async (req, res) => {
  try {
    const { plantId } = req.params;

    // Verify authorization
    if (req.user.role === "PLANT_ADMIN" && plantId !== req.user.plantId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized to access this plant's employees" });
    }

    const employees = await User.find({
      plantId: plantId,
      role: "EMPLOYEE",
      isActive: true
    }).select("name email position createdAt");

    res.json({ success: true, data: employees });
  } catch (error) {
    console.error("Get plant employees error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch plant employees" });
  }
};

export const updateAdmin = async (req, res) => {
  try {
    const { name, email, password, profileImage, phoneNumber, position } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (profileImage) updateData.profileImage = profileImage;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (position) updateData.position = position;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Update admin error:", error);
    res.status(500).json({ success: false, message: "Failed to update admin" });
  }
};
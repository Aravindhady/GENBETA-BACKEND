import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import bcrypt from "bcryptjs";
import { validateEmployeeCreation } from "../utils/planLimits.js";
import { sendWelcomeEmail, sendProfileUpdateNotification } from "../services/email.service.js";
import Plant from "../models/Plant.model.js";
import { generateCacheKey, getFromCache, setInCache } from "../utils/cache.js";

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

    // Handle pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Generate cache key
    const cacheParams = { page, limit, role: req.user.role };
    if (filter.companyId) cacheParams.companyId = filter.companyId;
    if (filter.plantId) cacheParams.plantId = filter.plantId;
    if (filter.role) cacheParams.role = filter.role;
    if (req.query.search) cacheParams.search = req.query.search;
    const cacheKey = generateCacheKey('users', cacheParams);
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Count total users for pagination metadata
    const total = await User.countDocuments(filter);

    // Get paginated users
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const result = {
      success: true,
      data: users,
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
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

export const updateAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const updateData = { name, email };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json({
      message: "Admin updated successfully",
      updated
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update admin" });
  }
};

export const getPlantEmployees = async (req, res) => {
  try {
    const { plantId } = req.params;
    
    // Generate cache key
    const cacheKey = generateCacheKey('plantEmployees', { plantId });
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }
    
    const employees = await User.find({ plantId, role: "EMPLOYEE", isActive: { $ne: false } }).select("-password");
    
    const result = { success: true, data: employees };
    
    // Cache the result for 5 minutes
    await setInCache(cacheKey, result, 300);
    
    res.json(result);
  } catch (error) {
    console.error("getPlantEmployees error:", error);
    res.status(500).json({ success: false, message: "Failed to get employees" });
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

    // Send welcome email
    try {
      const company = await Company.findById(targetCompanyId);
      const companyName = company ? company.name : "Your Company";
      const loginUrl = process.env.CLIENT_URL || "http://localhost:5173";
      
      await sendWelcomeEmail(
        email,
        name,
        "EMPLOYEE",
        companyName,
        loginUrl,
        password, // Send the raw password
        company
      );
    } catch (emailError) {
      console.error("Failed to send welcome email to employee:", emailError);
      // Don't fail the request if email fails
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
    const employeeId = req.params.id;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (req.user.role === "PLANT_ADMIN" && employee.plantId?.toString() !== req.user.plantId?.toString()) {
      return res.status(403).json({ message: "Not authorized to update this employee" });
    }

    if (email && email !== employee.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: employeeId } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updatedFields = {};
    if (name && name !== employee.name) updatedFields.Name = name;
    if (email && email !== employee.email) updatedFields.Email = email;
    if (position && position !== employee.position) updatedFields.Position = position;
    if (phoneNumber && phoneNumber !== employee.phoneNumber) updatedFields["Phone Number"] = phoneNumber;

    const updated = await User.findByIdAndUpdate(
      employeeId,
      { name, email, position, phoneNumber },
      { new: true }
    ).select("-password");

    // Invalidate cache for plant employees
    try {
      const employee = await User.findById(employeeId);
      if (employee && employee.plantId) {
        const cacheKey = generateCacheKey('plantEmployees', { plantId: employee.plantId.toString() });
        await deleteFromCache(cacheKey);
      }
    } catch (cacheError) {
      console.error('Cache invalidation error:', cacheError);
    }

    if (Object.keys(updatedFields).length > 0) {
      (async () => {
        try {
          const updater = await User.findById(req.user.id);
          const company = await Company.findById(employee.companyId);
          const plant = await Plant.findById(employee.plantId);
          
          await sendProfileUpdateNotification(
            updated.email,
            updated.name,
            updatedFields,
            updater?.name || "Administrator",
            company,
            plant
          );
        } catch (emailErr) {
          console.error("Failed to send profile update email:", emailErr);
        }
      })();
    }

    res.json({ message: "Employee updated successfully", user: updated });
  } catch (error) {
    console.error("updateEmployee error:", error);
    res.status(500).json({ message: "Failed to update employee" });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const employeeId = req.params.id;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (req.user.role === "PLANT_ADMIN" && employee.plantId?.toString() !== req.user.plantId?.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this employee" });
    }

    await User.findByIdAndUpdate(employeeId, { isActive: false });

    // Invalidate cache for plant employees
    try {
      const employee = await User.findById(employeeId);
      if (employee && employee.plantId) {
        const cacheKey = generateCacheKey('plantEmployees', { plantId: employee.plantId.toString() });
        await deleteFromCache(cacheKey);
      }
    } catch (cacheError) {
      console.error('Cache invalidation error:', cacheError);
    }

    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("deleteEmployee error:", error);
    res.status(500).json({ message: "Failed to delete employee" });
  }
};

/* ======================================================
   GET PROFILE
====================================================== */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("getProfile error:", error);
    res.status(500).json({ message: "Failed to get profile" });
  }
};

/* ======================================================
   UPDATE PROFILE
====================================================== */
export const updateProfile = async (req, res) => {
  try {
    const { name, email, password, profileImage, phoneNumber, position } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    if (profileImage) user.profileImage = profileImage;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (position) user.position = position;

    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        phoneNumber: user.phoneNumber,
        position: user.position
      }
    });
  } catch (error) {
    console.error("updateProfile error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

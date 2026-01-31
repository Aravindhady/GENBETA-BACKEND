import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .populate("companyId", "name logoUrl gstNumber address templateFeatureEnabled")
      .populate("plantId", "name plantNumber location code templateFeatureEnabled");
    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (!user.isActive)
      return res.status(403).json({ message: "Account is inactive" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid password" });

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

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        companyId: user.companyId?._id || user.companyId,
        plantId: user.plantId?._id || user.plantId
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ 
      token, 
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
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export const register = async (req, res) => {
  try {
    const { name, email, password, role = "COMPANY_ADMIN" } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      isActive: true
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: newUser._id,
        role: newUser.role,
        companyId: newUser.companyId,
        plantId: newUser.plantId
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ 
      token, 
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phoneNumber: newUser.phoneNumber,
        position: newUser.position,
        permissions: newUser.permissions,
        companyId: newUser.companyId,
        plantId: newUser.plantId
      }
    });
  } catch (error) {
    console.error("Registration error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};;

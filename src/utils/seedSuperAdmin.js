import User from "../models/User.model.js";
import bcrypt from "bcryptjs";

export const seedSuperAdmin = async () => {
  try {
    const existing = await User.findOne({
      email: process.env.SUPER_ADMIN_EMAIL,
      role: "SUPER_ADMIN"
    });

    if (existing) {
      console.log("⚠️ Super Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.SUPER_ADMIN_PASSWORD,
      10
    );

    await User.create({
      name: process.env.SUPER_ADMIN_NAME,
      email: process.env.SUPER_ADMIN_EMAIL,
      password: hashedPassword,
      role: "SUPER_ADMIN"
    });

    console.log("✅ Super Admin created");
  } catch (err) {
    console.error("❌ Super Admin seed error:", err.message);
  }
};

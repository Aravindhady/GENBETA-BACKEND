import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String
  },
  { timestamps: true }
);

export default mongoose.model("SuperAdmin", superAdminSchema);

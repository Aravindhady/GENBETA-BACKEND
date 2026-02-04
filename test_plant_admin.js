import dotenv from "dotenv";
import { connectDB } from "./src/config/db.js";
import User from "./src/models/User.model.js";
import Plant from "./src/models/Plant.model.js";

dotenv.config();

async function testPlantAdminQuery() {
  try {
    await connectDB();
    console.log("Connected to database");
    
    // Find a plant
    const plant = await Plant.findOne();
    if (!plant) {
      console.log("No plant found");
      return;
    }
    
    console.log("Plant found:", plant.name);
    
    // Find the plant admin
    const plantAdmin = await User.findOne({
      plantId: plant._id,
      role: "PLANT_ADMIN",
      isActive: true
    });
    
    if (plantAdmin) {
      console.log("Plant admin found:", plantAdmin.name, plantAdmin.email);
    } else {
      console.log("No plant admin found for this plant");
    }
    
    console.log("Test completed successfully!");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testPlantAdminQuery();
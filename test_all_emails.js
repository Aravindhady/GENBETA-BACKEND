import dotenv from "dotenv";
import { sendPlantCreatedEmail, sendWelcomeEmail } from "./src/services/email.service.js";
import Company from "./src/models/Company.model.js";
import Plant from "./src/models/Plant.model.js";
import { connectDB } from "./src/config/db.js";

dotenv.config();

async function testAllEmails() {
  try {
    await connectDB();
    console.log("Connected to database");
    
    // Test with actual company and plant data
    const company = await Company.findOne();
    const plant = await Plant.findOne();
    
    console.log("Company:", company?.name);
    console.log("Plant:", plant?.name);
    
    // Test plant created email
    console.log("\n--- Testing Plant Created Email ---");
    const plantResult = await sendPlantCreatedEmail(
      "test@example.com",
      "Test Plant",
      "PLT-123",
      company?.name || "Test Company",
      company || {},
      plant || {}
    );
    console.log("Plant created email result:", plantResult);
    
    // Test welcome email
    console.log("\n--- Testing Welcome Email ---");
    const welcomeResult = await sendWelcomeEmail(
      "test@example.com",
      "Test User",
      "PLANT_ADMIN",
      company?.name || "Test Company",
      "http://localhost:5173/login",
      "testpassword123",
      company || {},
      plant || {}
    );
    console.log("Welcome email result:", welcomeResult);
    
    console.log("\nAll email tests completed successfully!");
    
  } catch (error) {
    console.error("Email test failed:", error);
  }
}

testAllEmails();
import dotenv from "dotenv";
import { sendWelcomeEmail } from "./src/services/email.service.js";

dotenv.config();

async function testEmail() {
  try {
    console.log("Testing email service...");
    console.log("EMAIL_USER:", process.env.EMAIL_USER);
    console.log("EMAIL_HOST:", process.env.EMAIL_HOST);
    console.log("EMAIL_PORT:", process.env.EMAIL_PORT);
    
    const result = await sendWelcomeEmail(
      "test@example.com",
      "Test User",
      "EMPLOYEE",
      "Test Company",
      "http://localhost:5173/login",
      "testpassword123",
      {},
      {},
      "SYSTEM",
      null,
      null
    );
    
    console.log("Email sent successfully:", result);
  } catch (error) {
    console.error("Email test failed:", error);
  }
}

testEmail();
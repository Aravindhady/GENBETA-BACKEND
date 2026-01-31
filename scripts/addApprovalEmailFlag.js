import mongoose from "mongoose";
import dotenv from "dotenv";
import Form from "../src/models/Form.model.js";
import FormTemplate from "../src/models/FormTemplate.model.js";

dotenv.config();

async function addApprovalEmailFlag() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Update all existing form fields to have includeInApprovalEmail: false by default
    console.log("Updating existing forms...");
    
    const formResult = await Form.updateMany(
      { "fields.includeInApprovalEmail": { $exists: false } },
      { $set: { "fields.$[].includeInApprovalEmail": false } }
    );
    
    console.log(`Updated ${formResult.modifiedCount} forms`);

    const templateResult = await FormTemplate.updateMany(
      { "fields.includeInApprovalEmail": { $exists: false } },
      { $set: { "fields.$[].includeInApprovalEmail": false } }
    );
    
    console.log(`Updated ${templateResult.modifiedCount} form templates`);

    // Also update sections
    const sectionFormResult = await Form.updateMany(
      { "sections.fields.includeInApprovalEmail": { $exists: false } },
      { $set: { "sections.$[].fields.$[].includeInApprovalEmail": false } }
    );
    
    console.log(`Updated ${sectionFormResult.modifiedCount} forms with section fields`);

    const sectionTemplateResult = await FormTemplate.updateMany(
      { "sections.fields.includeInApprovalEmail": { $exists: false } },
      { $set: { "sections.$[].fields.$[].includeInApprovalEmail": false } }
    );
    
    console.log(`Updated ${sectionTemplateResult.modifiedCount} form templates with section fields`);

    console.log("Migration completed successfully!");
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.connection.close();
    console.log("Disconnected from MongoDB");
  }
}

// Run the migration
addApprovalEmailFlag();
import mongoose from 'mongoose';
import Form from './src/models/Form.model.js';

// Connect to MongoDB using the same URI as the app
await mongoose.connect('mongodb+srv://aravind:Aravind123@cluster0.x2c1o.mongodb.net/?appName=Cluster0');

async function checkEmployeeVisibleForms() {
  try {
    console.log('=== Checking all forms ===\n');
    
    // Get all forms
    const allForms = await Form.find({});
    console.log(`Total forms: ${allForms.length}\n`);
    
    allForms.forEach((form, index) => {
      console.log(`${index + 1}. Name: ${form.formName}`);
      console.log(`   ID: ${form._id}`);
      console.log(`   Status: ${form.status}`);
      console.log(`   Is Template: ${form.isTemplate}`);
      console.log(`   Active: ${form.isActive}`);
      console.log(`   Plant ID: ${form.plantId}`);
      console.log(`   Created: ${form.createdAt}`);
      console.log('   ---');
    });
    
    console.log('\n=== Forms that would be visible to EMPLOYEES (NEW LOGIC) ===\n');
    
    // Check forms that match NEW employee criteria (status only, plant filter would apply separately)
    const employeeVisible = await Form.find({
      isActive: true,
      status: { $in: ["APPROVED", "PUBLISHED"] }
    });
    
    console.log(`All published forms (visible if same plant): ${employeeVisible.length}\n`);
    
    employeeVisible.forEach((form, index) => {
      console.log(`${index + 1}. Name: ${form.formName}`);
      console.log(`   Status: ${form.status}`);
      console.log(`   Is Template: ${form.isTemplate}`);
      console.log(`   Plant ID: ${form.plantId}`);
      console.log('   ---');
    });
    
    console.log('\n=== Forms that would NOT be visible to EMPLOYEES (NEW LOGIC) ===\n');
    
    // Check forms that DON'T match NEW employee criteria
    const notVisible = await Form.find({
      $or: [
        { isActive: false },
        { status: { $nin: ["APPROVED", "PUBLISHED"] } }
      ]
    });
    
    console.log(`Non-visible forms: ${notVisible.length}\n`);
    
    notVisible.forEach((form, index) => {
      console.log(`${index + 1}. Name: ${form.formName}`);
      console.log(`   Status: ${form.status}`);
      console.log(`   Is Template: ${form.isTemplate}`);
      console.log(`   Active: ${form.isActive}`);
      console.log(`   Reason: ${form.isActive ? "Wrong status" : "Inactive"}`);
      console.log('   ---');
    });

  } catch (error) {
    console.error('Error checking forms:', error);
  } finally {
    await mongoose.connection.close();
  }
}

await checkEmployeeVisibleForms();
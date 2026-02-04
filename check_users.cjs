const mongoose = require('mongoose');

async function checkUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/genbeta');
    console.log('Connected to MongoDB');
    
    // Import User model dynamically
    const { default: User } = await import('./src/models/User.model.js');
    
    // Find all users
    const users = await User.find({}, 'name email role');
    console.log('Users in database:');
    users.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - ${user.role}`);
    });
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUsers();
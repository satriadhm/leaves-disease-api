// app/seeds/seed.js - Fixed version
const mongoose = require("mongoose");
const Role = require("../models/role.model");
const User = require("../models/user.model");
const bcrypt = require("bcryptjs");

// Load environment variables
require("dotenv").config();

const seedDatabase = async () => {
  try {
    // Use the same database configuration as the main app
    const dbUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/leaves-disease";
    
    console.log("Connecting to database:", dbUri);
    
    // Update mongoose connection for v7+
    await mongoose.connect(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to the database!");

    // Check if data already exists
    const existingRoles = await Role.countDocuments();
    const existingUsers = await User.countDocuments();
    
    if (existingRoles > 0 || existingUsers > 0) {
      console.log("Database already contains data. Skipping seed...");
      console.log(`Found ${existingRoles} roles and ${existingUsers} users`);
      await mongoose.disconnect();
      return;
    }

    console.log("Starting database seeding...");

    // Seed roles
    const roles = ["user", "admin", "moderator"];
    const createdRoles = {};
    
    for (let roleName of roles) {
      const role = await new Role({ name: roleName }).save();
      createdRoles[roleName] = role;
      console.log(`Role '${roleName}' added.`);
    }

    // Seed admin user
    const adminPassword = process.env.ADMIN_PASSWORD || "adminpassword";
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    
    const hashedAdminPassword = bcrypt.hashSync(adminPassword, 8);
    const adminUser = new User({
      username: adminUsername,
      email: adminEmail,
      password: hashedAdminPassword,
      roles: [createdRoles.admin._id],
      profile: {
        firstName: "Admin",
        lastName: "User"
      },
      status: "active"
    });

    await adminUser.save();
    console.log(`Admin user created: username '${adminUsername}', email '${adminEmail}'`);

    // Seed regular user for testing
    const userPassword = bcrypt.hashSync("userpassword", 8);
    const regularUser = new User({
      username: "testuser",
      email: "user@example.com",
      password: userPassword,
      roles: [createdRoles.user._id],
      profile: {
        firstName: "Test",
        lastName: "User"
      },
      status: "active"
    });

    await regularUser.save();
    console.log("Test user created: username 'testuser', password 'userpassword'");

    // Seed moderator user
    const moderatorPassword = bcrypt.hashSync("modpassword", 8);
    const moderatorUser = new User({
      username: "moderator",
      email: "mod@example.com",
      password: moderatorPassword,
      roles: [createdRoles.moderator._id],
      profile: {
        firstName: "Moderator",
        lastName: "User"
      },
      status: "active"
    });

    await moderatorUser.save();
    console.log("Moderator user created: username 'moderator', password 'modpassword'");

    await mongoose.disconnect();
    console.log("\n✅ Seeding completed successfully!");
    console.log("Default accounts created:");
    console.log(`   Admin: ${adminUsername} / ${adminPassword}`);
    console.log("   User: testuser / userpassword");
    console.log("   Moderator: moderator / modpassword");
    
  } catch (error) {
    console.error("❌ Error seeding the database:", error);
    process.exit(1);
  }
};

// Only run if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
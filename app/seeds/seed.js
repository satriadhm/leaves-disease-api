// app/seeds/seed.js
const mongoose = require("mongoose");
const Role = require("../models/role.model");
const User = require("../models/user.model");
const bcrypt = require("bcryptjs");

// Load environment variables
require("dotenv").config();

const seedDatabase = async () => {
  try {
    const dbUri = process.env.DB_URI || "mongodb://127.0.0.1:27017/auth_service";
    
    // Update mongoose connection for v7+
    await mongoose.connect(dbUri);

    console.log("Connected to the database!");

    // Clear existing data (optional)
    await Role.deleteMany({});
    await User.deleteMany({});
    console.log("Cleared existing data.");

    // Seed roles
    const roles = ["user", "admin", "moderator"];
    const createdRoles = {};
    
    for (let roleName of roles) {
      const role = await new Role({ name: roleName }).save();
      createdRoles[roleName] = role;
      console.log(`Role '${roleName}' added.`);
    }

    // Seed admin user
    const password = bcrypt.hashSync("adminpassword", 8);
    const adminUser = new User({
      username: "admin",
      email: "admin@example.com",
      password,
      roles: [createdRoles.admin._id]
    });

    await adminUser.save();
    console.log("Admin user added: username 'admin', password 'adminpassword'.");

    // Seed regular user
    const userPassword = bcrypt.hashSync("userpassword", 8);
    const regularUser = new User({
      username: "user",
      email: "user@example.com",
      password: userPassword,
      roles: [createdRoles.user._id]
    });

    await regularUser.save();
    console.log("Regular user added: username 'user', password 'userpassword'.");

    await mongoose.disconnect();
    console.log("Seeding completed. Disconnected from the database.");
  } catch (error) {
    console.error("Error seeding the database:", error);
    process.exit(1);
  }
};

seedDatabase();
// app/config/database.config.js
const mongoose = require("mongoose");

class DatabaseConfig {
  constructor() {
    this.isConnected = false;
    this.connectionOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Vercel-specific optimizations
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
      // Additional options for production
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      waitQueueTimeoutMS: 5000, // Make the client wait up to 5 seconds for a connection
    };

    // Add SSL options for Atlas in production
    if (process.env.NODE_ENV === 'production') {
      this.connectionOptions.ssl = true;
      this.connectionOptions.authSource = 'admin';
    }
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log("Database already connected");
        return;
      }

      console.log('Attempting to connect to MongoDB...');
      console.log('Environment:', process.env.NODE_ENV);
      console.log('Connection string (masked):', process.env.DB_URI?.replace(/\/\/.*@/, '//***:***@'));
      
      await mongoose.connect(process.env.DB_URI, this.connectionOptions);
      
      this.isConnected = true;
      console.log("✅ Connected to MongoDB successfully!");
      console.log("Database name:", mongoose.connection.db.databaseName);
      console.log("Connection readyState:", mongoose.connection.readyState);

      // Setup connection event handlers
      this.setupEventHandlers();

      // Auto-seed database if in production and no data exists
      if (process.env.NODE_ENV === 'production') {
        await this.autoSeedDatabase();
      }

    } catch (error) {
      this.isConnected = false;
      console.error("❌ MongoDB connection error:", error.message);
      
      // More detailed error information
      if (error.name === 'MongooseServerSelectionError') {
        console.error("This is likely an IP whitelist issue.");
        console.error("Please ensure 0.0.0.0/0 is added to your MongoDB Atlas IP Access List.");
        console.error("For Vercel deployments, you MUST allow access from anywhere (0.0.0.0/0).");
      }
      
      // Don't exit in production, let Vercel handle restarts
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      } else {
        // Log error but continue - Vercel will restart the function
        console.error("Continuing without database connection in production...");
      }
    }
  }

  setupEventHandlers() {
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      this.isConnected = true;
    });

    mongoose.connection.on('close', () => {
      console.log('MongoDB connection closed');
      this.isConnected = false;
    });
  }

  async autoSeedDatabase() {
    try {
      const Role = require("../models/role.model");
      const User = require("../models/user.model");
      const bcrypt = require("bcryptjs");

      // Check if roles already exist
      const roleCount = await Role.countDocuments();
      if (roleCount > 0) {
        console.log("Database already seeded, skipping...");
        return;
      }

      console.log("Auto-seeding database for production...");

      // Seed roles
      const roles = ["user", "admin", "moderator"];
      const createdRoles = {};

      for (let roleName of roles) {
        const role = await new Role({ name: roleName }).save();
        createdRoles[roleName] = role;
        console.log(`Role '${roleName}' added.`);
      }

      // Seed admin user with environment variables
      const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";
      const adminUsername = process.env.ADMIN_USERNAME || "admin";
      const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
      
      const hashedPassword = bcrypt.hashSync(adminPassword, 8);
      const adminUser = new User({
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        roles: [createdRoles.admin._id],
        profile: {
          firstName: "Admin",
          lastName: "User"
        },
        status: "active"
      });

      await adminUser.save();
      console.log(`✅ Admin user created: ${adminUsername}`);

    } catch (error) {
      console.error("Auto-seed error:", error.message);
      // Don't throw error, just log it
    }
  }

  async getHealthStatus() {
    try {
      const healthStatus = {
        connection: {
          state: mongoose.connection.readyState,
          stateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
          name: mongoose.connection.db?.databaseName,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          isConnected: this.isConnected
        },
        collections: {},
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          DB_URI_HOST: process.env.DB_URI?.split('@')[1]?.split('/')[0] || 'not set'
        }
      };

      if (mongoose.connection.readyState === 1) {
        // Test collections
        const Role = require("../models/role.model");
        const User = require("../models/user.model");
        const Prediction = require("../models/prediction.model");
        
        healthStatus.collections.roles = await Role.countDocuments();
        healthStatus.collections.users = await User.countDocuments();
        healthStatus.collections.predictions = await Prediction.countDocuments();
      }

      return healthStatus;
    } catch (error) {
      return {
        connection: {
          state: -1,
          stateText: 'error',
          error: error.message,
          isConnected: false
        }
      };
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log("Database disconnected successfully");
    } catch (error) {
      console.error("Error disconnecting from database:", error);
    }
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
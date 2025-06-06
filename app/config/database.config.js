const mongoose = require("mongoose");

class DatabaseConfig {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    
    this.connectionOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      serverSelectionTimeoutMS: 8000,   // Reduced from 5000
      socketTimeoutMS: 20000,           // Reduced from 45000
      connectTimeoutMS: 10000,           // Added
      
      maxPoolSize: 5,                   // Reduced from 10 for Vercel
      minPoolSize: 1,                   // Added minimum
      maxIdleTimeMS: 20000,            // Reduced from 30000
      waitQueueTimeoutMS: 3000,        // Reduced from 5000
      
      family: 4,                       // Use IPv4
      heartbeatFrequencyMS: 10000,     // Added
      retryWrites: true,               // Added
      w: 'majority',                   // Added write concern
      
    };

    if (process.env.NODE_ENV === 'production') {
      this.connectionOptions.ssl = true;
      this.connectionOptions.authSource = 'admin';
      this.connectionOptions.retryReads = true;
    }
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log("✅ Database already connected");
        return true;
      }

      // Validate environment variables
      if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI environment variable is required");
      }

      console.log('🔄 Attempting to connect to MongoDB...');
      console.log('📍 Environment:', process.env.NODE_ENV);
      
      const maskedUri = process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@');
      console.log('🔗 Connection URI (masked):', maskedUri);
      
      await this.connectWithRetry();
      
      this.isConnected = true;
      console.log("✅ Connected to MongoDB successfully!");
      console.log("📊 Database name:", mongoose.connection.db.databaseName);
      console.log("🔌 Connection readyState:", mongoose.connection.readyState);

      this.setupEventHandlers();

      // Initialize database (create indexes, seed if needed)
      await this.initializeDatabase();

      return true;

    } catch (error) {
      this.isConnected = false;
      console.error("❌ MongoDB connection error:", error.message);
      
      // Enhanced error handling
      if (error.name === 'MongooseServerSelectionError') {
        console.error("🚨 Server Selection Error Details:");
        console.error("   - This is likely an IP whitelist or connection string issue");
        console.error("   - For MongoDB Atlas: ensure 0.0.0.0/0 is in IP Access List");
        console.error("   - For Vercel: must allow access from anywhere");
        console.error("   - Check if database cluster is running");
      }
      
      if (error.name === 'MongooseTimeoutError') {
        console.error("⏱️ Connection Timeout:");
        console.error("   - Database server might be slow or overloaded");
        console.error("   - Network connectivity issues");
        console.error("   - Consider upgrading database cluster");
      }

      // In production, don't exit - let Vercel handle restarts
      if (process.env.NODE_ENV !== 'production') {
        console.error("💀 Exiting due to database connection failure...");
        process.exit(1);
      } else {
        console.error("⚠️ Continuing without database connection in production...");
        return false;
      }
    }
  }

  async connectWithRetry() {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        this.connectionAttempts++;
        console.log(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`);
        
        await mongoose.connect(process.env.MONGODB_URI, this.connectionOptions);
        console.log(`✅ Connection successful on attempt ${this.connectionAttempts}`);
        return;
        
      } catch (error) {
        console.error(`❌ Connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        if (i === this.maxRetries - 1) {
          throw error; // Re-throw on last attempt
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, i), 5000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  setupEventHandlers() {
    // Connection lost
    mongoose.connection.on('error', (err) => {
      console.error('🚨 MongoDB connection error:', err.message);
      this.isConnected = false;
    });

    // Disconnected
    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
      this.isConnected = false;
    });

    // Reconnected
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
      this.isConnected = true;
    });

    // Connection closed
    mongoose.connection.on('close', () => {
      console.log('🔒 MongoDB connection closed');
      this.isConnected = false;
    });

    // Process termination handlers
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
  }

  async initializeDatabase() {
    try {
      console.log('🔧 Initializing database...');

      // Create indexes for better performance
      await this.createIndexes();

      // Auto-seed in production if needed
      if (process.env.NODE_ENV === 'production') {
        await this.ensureDefaultData();
      }

      console.log('✅ Database initialization complete');
    } catch (error) {
      console.error('⚠️ Database initialization error:', error.message);
      // Don't throw - let app continue
    }
  }

  async createIndexes() {
    try {
      const Role = require("../models/role.model");
      const User = require("../models/user.model");
      const Prediction = require("../models/prediction.model");

      // Create indexes if they don't exist
      await Role.createIndexes();
      await User.createIndexes();
      await Prediction.createIndexes();
      
      console.log('📊 Database indexes created/verified');
    } catch (error) {
      console.error('⚠️ Index creation warning:', error.message);
    }
  }

  async ensureDefaultData() {
    try {
      const Role = require("../models/role.model");
      const User = require("../models/user.model");
      const bcrypt = require("bcryptjs");

      // Quick check - don't proceed if data exists
      const [roleCount, userCount] = await Promise.all([
        Role.countDocuments().maxTimeMS(10000),
        User.countDocuments().maxTimeMS(10000)
      ]);

      if (roleCount > 0 && userCount > 0) {
        console.log(`📊 Database already seeded (${roleCount} roles, ${userCount} users)`);
        return;
      }

      console.log('🌱 Auto-seeding database for production...');

      // Create roles with timeout
      const roles = ["user", "admin", "moderator"];
      const createdRoles = {};

      for (let roleName of roles) {
        let role = await Role.findOne({ name: roleName }).maxTimeMS(10000);
        if (!role) {
          role = await new Role({ name: roleName }).save();
        }
        createdRoles[roleName] = role;
        console.log(`✅ Role '${roleName}' ensured`);
      }

      // Create admin user if doesn't exist
      const adminUsername = process.env.ADMIN_USERNAME || "admin";
      const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
      
      const existingAdmin = await User.findOne({
        $or: [{ username: adminUsername }, { email: adminEmail }]
      }).maxTimeMS(10000);

      if (!existingAdmin) {
        const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";
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
      } else {
        console.log(`✅ Admin user already exists: ${adminUsername}`);
      }

    } catch (error) {
      console.error("⚠️ Auto-seed warning:", error.message);
      // Don't throw error - continue without seeding
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
          isConnected: this.isConnected,
          attempts: this.connectionAttempts
        },
        collections: {},
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          hasDbUri: !!process.env.MONGODB_URI,
          dbHost: process.env.MONGODB_URI?.split('@')[1]?.split('/')[0] || 'not set'
        },
        performance: {
          bufferCommands: mongoose.get('bufferCommands'),
          // Removed bufferMaxEntries check as it's not always available
        }
      };

      if (mongoose.connection.readyState === 1) {
        // Test collections with timeout
        const Role = require("../models/role.model");
        const User = require("../models/user.model");
        const Prediction = require("../models/prediction.model");
        
        const collectionTests = await Promise.allSettled([
          Role.countDocuments().maxTimeMS(13000),
          User.countDocuments().maxTimeMS(13000),
          Prediction.countDocuments().maxTimeMS(13000)
        ]);

        healthStatus.collections.roles = collectionTests[0].status === 'fulfilled' ? collectionTests[0].value : 'timeout';
        healthStatus.collections.users = collectionTests[1].status === 'fulfilled' ? collectionTests[1].value : 'timeout';
        healthStatus.collections.predictions = collectionTests[2].status === 'fulfilled' ? collectionTests[2].value : 'timeout';
      }

      return healthStatus;
    } catch (error) {
      return {
        connection: {
          state: -1,
          stateText: 'error',
          error: error.message,
          isConnected: false,
          attempts: this.connectionAttempts
        }
      };
    }
  }

  async gracefulShutdown(signal) {
    console.log(`🛑 Received ${signal}, shutting down gracefully...`);
    try {
      await mongoose.disconnect();
      console.log('✅ Database disconnected successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log("✅ Database disconnected successfully");
    } catch (error) {
      console.error("❌ Error disconnecting from database:", error);
    }
  }

  // Quick connection test method
  async testConnection() {
    try {
      if (!this.isConnected) {
        return { connected: false, error: 'Not connected' };
      }

      // Quick ping test
      await mongoose.connection.db.admin().ping();
      return { connected: true, latency: Date.now() };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
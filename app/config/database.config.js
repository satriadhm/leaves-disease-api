// app/config/database.config.js - MONGOOSE 7+ COMPATIBLE VERSION
const mongoose = require("mongoose");

class DatabaseConfig {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    
    // Mongoose 7+ compatible connection options
    this.connectionOptions = {
      // Core connection options
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      // Timeout settings - Optimized for Vercel
      serverSelectionTimeoutMS: 8000,   // 8 seconds for server selection
      socketTimeoutMS: 20000,           // 20 seconds for socket operations
      connectTimeoutMS: 8000,           // 8 seconds for initial connection
      
      // Connection pool settings
      maxPoolSize: 5,                   // Maximum connections in pool
      minPoolSize: 1,                   // Minimum connections in pool
      maxIdleTimeMS: 20000,            // Close connections after 20s of inactivity
      waitQueueTimeoutMS: 3000,        // Maximum time to wait for a connection
      
      // Network and performance settings
      family: 4,                       // Use IPv4 only
      heartbeatFrequencyMS: 10000,     // How often to check server health
      retryWrites: true,               // Retry failed writes
      w: 'majority',                   // Write concern - wait for majority acknowledgment
    };

    // SSL and authentication for production
    if (process.env.NODE_ENV === 'production') {
      this.connectionOptions.ssl = true;
      this.connectionOptions.authSource = 'admin';
      this.connectionOptions.retryReads = true;
    }

    // Set global mongoose settings (Mongoose 7+ way)
    this.configureMongooseGlobals();
  }

  configureMongooseGlobals() {
    // Disable buffering globally for Mongoose 7+
    mongoose.set('bufferCommands', false);
    
    // Set timeout for operations
    mongoose.set('maxTimeMS', 20000);
    
    // Disable automatic index creation in production
    if (process.env.NODE_ENV === 'production') {
      mongoose.set('autoIndex', false);
    }

    // Set strict mode
    mongoose.set('strict', true);
    
    // Debug mode in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log("✅ Database already connected");
        return true;
      }

      // Validate environment variables
      if (!process.env.DB_URI) {
        throw new Error("DB_URI environment variable is required");
      }

      console.log('🔄 Attempting to connect to MongoDB...');
      console.log('📍 Environment:', process.env.NODE_ENV);
      console.log('🔗 Mongoose version:', mongoose.version);
      
      // Mask sensitive parts of connection string for logging
      const maskedUri = process.env.DB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
      console.log('🔗 Connection URI (masked):', maskedUri);
      
      // Connect with retry logic
      await this.connectWithRetry();
      
      this.isConnected = true;
      console.log("✅ Connected to MongoDB successfully!");
      console.log("📊 Database name:", mongoose.connection.db.databaseName);
      console.log("🔌 Connection readyState:", this.getReadyStateText());
      console.log("🏊 Connection pool size:", mongoose.connection.db.serverConfig?.s?.poolSize || 'N/A');

      // Setup connection event handlers
      this.setupEventHandlers();

      // Initialize database (create indexes, seed if needed)
      await this.initializeDatabase();

      return true;

    } catch (error) {
      this.isConnected = false;
      console.error("❌ MongoDB connection error:", error.message);
      
      // Enhanced error handling
      this.handleConnectionError(error);

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

  getReadyStateText() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized'
    };
    return states[mongoose.connection.readyState] || 'unknown';
  }

  handleConnectionError(error) {
    if (error.name === 'MongooseServerSelectionError') {
      console.error("🚨 Server Selection Error Details:");
      console.error("   - Check if MongoDB cluster is running");
      console.error("   - Verify connection string format");
      console.error("   - For MongoDB Atlas: ensure 0.0.0.0/0 is in IP Access List");
      console.error("   - For Vercel: must allow access from anywhere");
      console.error("   - Check database credentials");
    } else if (error.name === 'MongooseTimeoutError') {
      console.error("⏱️ Connection Timeout:");
      console.error("   - Database server might be slow or overloaded");
      console.error("   - Network connectivity issues");
      console.error("   - Consider upgrading database cluster");
    } else if (error.message.includes('Authentication failed')) {
      console.error("🔐 Authentication Error:");
      console.error("   - Check username and password in connection string");
      console.error("   - Verify database user permissions");
      console.error("   - Ensure database user exists");
    } else if (error.message.includes('not a valid option')) {
      console.error("⚙️ Configuration Error:");
      console.error("   - Invalid mongoose option detected");
      console.error("   - Check mongoose version compatibility");
      console.error("   - Error details:", error.message);
    }
  }

  async connectWithRetry() {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        this.connectionAttempts++;
        console.log(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`);
        
        // Use mongoose.connect with proper error handling
        await mongoose.connect(process.env.DB_URI, this.connectionOptions);
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
    // Connection events
    mongoose.connection.on('error', (err) => {
      console.error('🚨 MongoDB connection error:', err.message);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
      this.isConnected = true;
    });

    mongoose.connection.on('close', () => {
      console.log('🔒 MongoDB connection closed');
      this.isConnected = false;
    });

    mongoose.connection.on('open', () => {
      console.log('🚀 MongoDB connection opened');
      this.isConnected = true;
    });

    // Process termination handlers
    const gracefulShutdown = (signal) => {
      console.log(`🛑 Received ${signal}, shutting down gracefully...`);
      this.gracefulShutdown(signal);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  async initializeDatabase() {
    try {
      console.log('🔧 Initializing database...');

      // Wait for connection to be fully established
      if (mongoose.connection.readyState !== 1) {
        console.log('⏳ Waiting for connection to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

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
      // Dynamically import models to avoid circular dependency
      const Role = require("../models/role.model");
      const User = require("../models/user.model");
      const Prediction = require("../models/prediction.model");

      // Create indexes with timeout
      const indexPromises = [
        Role.createIndexes(),
        User.createIndexes(),
        Prediction.createIndexes()
      ];

      await Promise.allSettled(indexPromises);
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

      // Quick check with timeout - don't proceed if data exists
      const checkPromises = [
        Role.countDocuments().maxTimeMS(5000),
        User.countDocuments().maxTimeMS(5000)
      ];

      const [roleCount, userCount] = await Promise.allSettled(checkPromises);
      
      const roles = roleCount.status === 'fulfilled' ? roleCount.value : 0;
      const users = userCount.status === 'fulfilled' ? userCount.value : 0;

      if (roles > 0 && users > 0) {
        console.log(`📊 Database already seeded (${roles} roles, ${users} users)`);
        return;
      }

      console.log('🌱 Auto-seeding database for production...');

      // Create roles with timeout
      const roleNames = ["user", "admin", "moderator"];
      const createdRoles = {};

      for (let roleName of roleNames) {
        let role = await Role.findOne({ name: roleName }).maxTimeMS(5000);
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
      }).maxTimeMS(5000);

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
          stateText: this.getReadyStateText(),
          name: mongoose.connection.db?.databaseName,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          isConnected: this.isConnected,
          attempts: this.connectionAttempts,
          mongooseVersion: mongoose.version
        },
        collections: {},
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          hasDbUri: !!process.env.DB_URI,
          dbHost: process.env.DB_URI?.split('@')[1]?.split('/')[0] || 'not set'
        },
        settings: {
          bufferCommands: mongoose.get('bufferCommands'),
          maxTimeMS: mongoose.get('maxTimeMS'),
          autoIndex: mongoose.get('autoIndex'),
          strict: mongoose.get('strict')
        }
      };

      if (mongoose.connection.readyState === 1) {
        // Test collections with timeout
        const Role = require("../models/role.model");
        const User = require("../models/user.model");
        const Prediction = require("../models/prediction.model");
        
        const collectionTests = await Promise.allSettled([
          Role.countDocuments().maxTimeMS(3000),
          User.countDocuments().maxTimeMS(3000),
          Prediction.countDocuments().maxTimeMS(3000)
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
          attempts: this.connectionAttempts,
          mongooseVersion: mongoose.version
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

      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - startTime;
      
      return { connected: true, latency };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  // Method to check mongoose version compatibility
  checkMongooseVersion() {
    const version = mongoose.version;
    const majorVersion = parseInt(version.split('.')[0]);
    
    console.log(`🔍 Mongoose version: ${version}`);
    
    if (majorVersion < 6) {
      console.warn('⚠️ Mongoose version is quite old. Consider upgrading.');
    } else if (majorVersion >= 7) {
      console.log('✅ Using modern Mongoose version with optimized settings');
    }
    
    return { version, majorVersion, compatible: majorVersion >= 6 };
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
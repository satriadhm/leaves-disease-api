// app/config/database.config.js - MongoDB Native Client Version
const { MongoClient } = require("mongodb");

class DatabaseConfig {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.client = null;
    this.db = null;
    
    // Optimized connection options untuk Vercel dan MongoDB Atlas
    this.connectionOptions = {
      // Timeout settings - DIPERPENDEK untuk Vercel  
      serverSelectionTimeoutMS: 8000,   // Reduced from 30000
      socketTimeoutMS: 20000,           // Reduced from 45000
      connectTimeoutMS: 8000,           // Connection timeout
      
      // Connection pool settings
      maxPoolSize: 5,                   // Reduced from 10 for Vercel
      minPoolSize: 1,                   // Minimum connections
      maxIdleTimeMS: 20000,             // Reduced from 30000
      waitQueueTimeoutMS: 3000,         // Wait queue timeout
      
      // Other optimizations
      family: 4,                        // Use IPv4
      heartbeatFrequencyMS: 10000,      // Heartbeat frequency
      retryWrites: true,                // Retry writes
      w: 'majority',                    // Write concern
      
      // Compression
      compressors: ['zlib'],            // Enable compression
      zlibCompressionLevel: 6,          // Compression level
    };

    // SSL options for Atlas in production
    if (process.env.NODE_ENV === 'production') {
      this.connectionOptions.ssl = true;
      this.connectionOptions.authSource = 'admin';
      this.connectionOptions.retryReads = true;
    }
  }

  async connect() {
    try {
      if (this.isConnected && this.client) {
        console.log("✅ Database already connected");
        return true;
      }

      // Validate environment variables
      if (!process.env.DB_URI) {
        throw new Error("DB_URI environment variable is required");
      }

      console.log('🔄 Attempting to connect to MongoDB...');
      console.log('📍 Environment:', process.env.NODE_ENV);
      
      // Mask sensitive parts of connection string for logging
      const maskedUri = process.env.DB_URI.replace(/\/\/.*@/, '//***:***@');
      console.log('🔗 Connection URI (masked):', maskedUri);
      
      // Connect with retry logic
      await this.connectWithRetry();
      
      this.isConnected = true;
      console.log("✅ Connected to MongoDB successfully!");
      console.log("📊 Database name:", this.db.databaseName);

      // Setup connection event handlers
      this.setupEventHandlers();

      // Initialize database (create indexes, seed if needed)
      await this.initializeDatabase();

      return true;

    } catch (error) {
      this.isConnected = false;
      console.error("❌ MongoDB connection error:", error.message);
      
      // Enhanced error handling
      if (error.name === 'MongoServerSelectionError') {
        console.error("🚨 Server Selection Error Details:");
        console.error("   - This is likely an IP whitelist or connection string issue");
        console.error("   - For MongoDB Atlas: ensure 0.0.0.0/0 is in IP Access List");
        console.error("   - For Vercel: must allow access from anywhere");
        console.error("   - Check if database cluster is running");
      }
      
      if (error.name === 'MongoTimeoutError') {
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
        
        // Create new client instance
        this.client = new MongoClient(process.env.DB_URI, this.connectionOptions);
        
        // Connect to MongoDB
        await this.client.connect();
        
        // Get database name from URI or use default
        const dbName = this.extractDatabaseName(process.env.DB_URI);
        this.db = this.client.db(dbName);
        
        // Test connection
        await this.db.admin().ping();
        
        console.log(`✅ Connection successful on attempt ${this.connectionAttempts}`);
        return;
        
      } catch (error) {
        console.error(`❌ Connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        // Close failed connection
        if (this.client) {
          try {
            await this.client.close();
          } catch (closeError) {
            // Ignore close errors
          }
          this.client = null;
          this.db = null;
        }
        
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

  extractDatabaseName(uri) {
    try {
      // Extract database name from MongoDB URI
      const match = uri.match(/\/([^/?]+)(?:\?|$)/);
      return match ? match[1] : 'defaultdb';
    } catch (error) {
      console.warn('⚠️ Could not extract database name from URI, using default: defaultdb');
      return 'defaultdb';
    }
  }

  setupEventHandlers() {
    // Process termination handlers
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    
    // Client error handlers
    if (this.client) {
      this.client.on('error', (err) => {
        console.error('🚨 MongoDB client error:', err.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('🔒 MongoDB connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnect', () => {
        console.log('🔄 MongoDB reconnected');
        this.isConnected = true;
      });
    }
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
      if (!this.db) return;

      // Create indexes for collections
      const rolesCollection = this.db.collection('roles');
      const usersCollection = this.db.collection('users');
      const predictionsCollection = this.db.collection('predictions');

      // Create indexes
      await Promise.allSettled([
        rolesCollection.createIndex({ name: 1 }, { unique: true }),
        usersCollection.createIndex({ username: 1 }, { unique: true }),
        usersCollection.createIndex({ email: 1 }, { unique: true }),
        predictionsCollection.createIndex({ createdAt: -1 }),
        predictionsCollection.createIndex({ userId: 1 })
      ]);
      
      console.log('📊 Database indexes created/verified');
    } catch (error) {
      console.error('⚠️ Index creation warning:', error.message);
    }
  }

  async ensureDefaultData() {
    try {
      if (!this.db) return;

      const rolesCollection = this.db.collection('roles');
      const usersCollection = this.db.collection('users');
      const bcrypt = require("bcryptjs");

      // Quick check - don't proceed if data exists
      const [roleCount, userCount] = await Promise.all([
        rolesCollection.countDocuments({}, { maxTimeMS: 5000 }),
        usersCollection.countDocuments({}, { maxTimeMS: 5000 })
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
        let role = await rolesCollection.findOne({ name: roleName }, { maxTimeMS: 5000 });
        if (!role) {
          const result = await rolesCollection.insertOne({
            name: roleName,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          role = { _id: result.insertedId, name: roleName };
        }
        createdRoles[roleName] = role;
        console.log(`✅ Role '${roleName}' ensured`);
      }

      // Create admin user if doesn't exist
      const adminUsername = process.env.ADMIN_USERNAME || "admin";
      const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
      
      const existingAdmin = await usersCollection.findOne({
        $or: [{ username: adminUsername }, { email: adminEmail }]
      }, { maxTimeMS: 5000 });

      if (!existingAdmin) {
        const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";
        const hashedPassword = bcrypt.hashSync(adminPassword, 8);
        
        await usersCollection.insertOne({
          username: adminUsername,
          email: adminEmail,
          password: hashedPassword,
          roles: [createdRoles.admin._id],
          profile: {
            firstName: "Admin",
            lastName: "User"
          },
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date()
        });

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
          state: this.isConnected ? 1 : 0,
          stateText: this.isConnected ? 'connected' : 'disconnected',
          name: this.db?.databaseName,
          isConnected: this.isConnected,
          attempts: this.connectionAttempts
        },
        collections: {},
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          hasDbUri: !!process.env.DB_URI,
          dbHost: process.env.DB_URI?.split('@')[1]?.split('/')[0] || 'not set'
        },
        performance: {
          clientConnected: !!this.client,
          databaseConnected: !!this.db
        }
      };

      if (this.isConnected && this.db) {
        // Test collections with timeout
        const collectionTests = await Promise.allSettled([
          this.db.collection('roles').countDocuments({}, { maxTimeMS: 3000 }),
          this.db.collection('users').countDocuments({}, { maxTimeMS: 3000 }),
          this.db.collection('predictions').countDocuments({}, { maxTimeMS: 3000 })
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
      if (this.client) {
        await this.client.close();
      }
      console.log('✅ Database disconnected successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
      }
      this.isConnected = false;
      console.log("✅ Database disconnected successfully");
    } catch (error) {
      console.error("❌ Error disconnecting from database:", error);
    }
  }

  // Quick connection test method
  async testConnection() {
    try {
      if (!this.isConnected || !this.db) {
        return { connected: false, error: 'Not connected' };
      }

      // Quick ping test
      const startTime = Date.now();
      await this.db.admin().ping();
      const latency = Date.now() - startTime;
      
      return { connected: true, latency };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  // Helper method to get database instance (for compatibility)
  getDatabase() {
    return this.db;
  }

  // Helper method to get client instance
  getClient() {
    return this.client;
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
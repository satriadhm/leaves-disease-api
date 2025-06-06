// app/config/database.config.js - VERCEL SERVERLESS OPTIMIZED VERSION
const mongoose = require("mongoose");

// Global connection cache for serverless functions
let cachedConnection = null;

class DatabaseConfig {
  constructor() {
    this.connectionAttempts = 0;
    this.maxRetries = 2; // Reduced for faster failures
    
    // Vercel Serverless optimized connection options
    this.connectionOptions = {
      // Core connection options
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      // Aggressive timeout settings for Vercel
      serverSelectionTimeoutMS: 5000,    // 5 seconds (reduced from 8s)
      socketTimeoutMS: 8000,             // 8 seconds (reduced from 20s)
      connectTimeoutMS: 5000,            // 5 seconds (reduced from 8s)
      
      // Connection pool settings optimized for serverless
      maxPoolSize: 3,                    // Reduced pool size for serverless
      minPoolSize: 0,                    // No minimum connections
      maxIdleTimeMS: 5000,               // Close idle connections quickly (5s)
      waitQueueTimeoutMS: 2000,          // Reduced wait time
      
      // Network and performance settings
      family: 4,                         // Use IPv4 only
      heartbeatFrequencyMS: 30000,       // Less frequent heartbeats
      retryWrites: true,
      w: 'majority',
      
      // Buffer settings for faster failures
      bufferMaxEntries: 0,               // Disable mongoose buffering
      bufferCommands: false,             // Disable command buffering
    };

    // SSL and authentication for production
    if (process.env.NODE_ENV === 'production') {
      this.connectionOptions.ssl = true;
      this.connectionOptions.authSource = 'admin';
      this.connectionOptions.retryReads = false; // Disabled for faster failures
    }

    // Set global mongoose settings for serverless
    this.configureMongooseGlobals();
  }

  configureMongooseGlobals() {
    // Disable buffering globally - Critical for serverless
    mongoose.set('bufferCommands', false);
    
    // Shorter timeout for operations
    mongoose.set('maxTimeMS', 8000); // Reduced from 20s
    
    // Always disable automatic index creation in serverless
    mongoose.set('autoIndex', false);
    
    // Set strict mode
    mongoose.set('strict', true);
    
    // No debug mode in production to reduce overhead
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }
  }

  // Main connection method with caching for serverless
  async connect() {
    try {
      // Return cached connection if available and valid
      if (cachedConnection && mongoose.connection.readyState === 1) {
        console.log("✅ Using cached database connection");
        return cachedConnection;
      }

      // Validate environment variables
      if (!process.env.DB_URI) {
        throw new Error("DB_URI environment variable is required");
      }

      console.log('🔄 Creating new MongoDB connection...');
      console.log('📍 Environment:', process.env.NODE_ENV);
      console.log('🔗 Mongoose version:', mongoose.version);
      
      // Close any existing connections first
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      
      // Connect with retry logic
      await this.connectWithRetry();
      
      // Cache the connection
      cachedConnection = mongoose.connection;
      
      console.log("✅ New MongoDB connection established!");
      console.log("📊 Database name:", mongoose.connection.db.databaseName);
      console.log("🔌 Connection state:", this.getReadyStateText());

      // Setup minimal event handlers for serverless
      this.setupMinimalEventHandlers();

      return cachedConnection;

    } catch (error) {
      console.error("❌ MongoDB connection error:", error.message);
      
      // Enhanced error handling
      this.handleConnectionError(error);

      // In serverless, don't exit - just throw the error
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  // Simplified connection method for serverless
  async connectWithRetry() {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        this.connectionAttempts++;
        console.log(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`);
        
        // Use mongoose.connect with timeout wrapper
        const connectPromise = mongoose.connect(process.env.DB_URI, this.connectionOptions);
        
        // Add additional timeout wrapper for Vercel
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 8000);
        });
        
        await Promise.race([connectPromise, timeoutPromise]);
        console.log(`✅ Connection successful on attempt ${this.connectionAttempts}`);
        return;
        
      } catch (error) {
        console.error(`❌ Connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        if (i === this.maxRetries - 1) {
          throw error; // Re-throw on last attempt
        }
        
        // Shorter wait time for serverless
        const delay = Math.min(1000 * (i + 1), 3000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Minimal event handlers for serverless
  setupMinimalEventHandlers() {
    // Only essential error handlers
    mongoose.connection.on('error', (err) => {
      console.error('🚨 MongoDB connection error:', err.message);
      cachedConnection = null; // Clear cache on error
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
      cachedConnection = null; // Clear cache on disconnect
    });

    // No graceful shutdown handlers in serverless - Vercel handles this
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
      console.error("🚨 Server Selection Error - Check:");
      console.error("   - MongoDB Atlas IP whitelist (add 0.0.0.0/0)");
      console.error("   - Connection string format");
      console.error("   - Database cluster status");
    } else if (error.message.includes('timeout')) {
      console.error("⏱️ Connection Timeout - Consider:");
      console.error("   - Upgrading MongoDB cluster tier");
      console.error("   - Checking network connectivity");
      console.error("   - Reducing timeout values");
    } else if (error.message.includes('Authentication failed')) {
      console.error("🔐 Authentication Error - Verify:");
      console.error("   - Username and password in DB_URI");
      console.error("   - Database user permissions");
    }
  }

  // Quick health check for serverless
  async getHealthStatus() {
    try {
      const isConnected = mongoose.connection.readyState === 1;
      const healthStatus = {
        connection: {
          state: mongoose.connection.readyState,  
          stateText: this.getReadyStateText(),
          isConnected,
          cached: !!cachedConnection,
          attempts: this.connectionAttempts,
          mongooseVersion: mongoose.version
        },
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          hasDbUri: !!process.env.DB_URI,
          platform: 'vercel-serverless'
        }
      };

      // Quick ping test if connected
      if (isConnected) {
        const startTime = Date.now();
        await mongoose.connection.db.admin().ping();
        healthStatus.connection.latency = Date.now() - startTime;
      }

      return healthStatus;
    } catch (error) {
      return {
        connection: {
          state: -1,
          stateText: 'error',
          error: error.message,
          isConnected: false,
          cached: false
        }
      };
    }
  }

  // Test connection method
  async testConnection() {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { connected: false, error: 'Not connected' };
      }

      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - startTime;
      
      return { connected: true, latency, cached: !!cachedConnection };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  // Method to ensure connection is established (use this in your API routes)
  async ensureConnection() {
    if (!cachedConnection || mongoose.connection.readyState !== 1) {
      return await this.connect();
    }
    return cachedConnection;
  }

  // Clear cache method (useful for testing)
  clearCache() {
    cachedConnection = null;
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
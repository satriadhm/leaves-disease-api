// app/config/database.config.js - VERCEL PRODUCTION-READY VERSION
const mongoose = require("mongoose");

// Global connection cache for serverless functions
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
    readyState: 0
  };
}

class DatabaseConfig {
  constructor() {
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    
    // Build safe connection options
    this.connectionOptions = {
      // Core options
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      // Vercel-optimized timeouts
      serverSelectionTimeoutMS: 10000,  // 10 seconds
      socketTimeoutMS: 45000,           // 45 seconds
      connectTimeoutMS: 10000,          // 10 seconds
      
      // Connection pool for serverless
      maxPoolSize: 10,                  // Max connections
      minPoolSize: 0,                   // Min connections
      maxIdleTimeMS: 30000,             // 30 seconds idle
      
      // Network settings
      family: 4,                        // IPv4
      retryWrites: true,
      w: 'majority'
    };

    // Production-specific settings
    if (process.env.NODE_ENV === 'production') {
      this.connectionOptions.ssl = true;
      this.connectionOptions.authSource = 'admin';
    }

    // Configure mongoose globally
    this.configureMongooseGlobals();
  }

  configureMongooseGlobals() {
    // Disable buffering for serverless
    mongoose.set('bufferCommands', false);
    
    // Disable auto index in production
    mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');
    
    // Set strict mode
    mongoose.set('strict', true);
    
    // Debug only in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }
  }

  async connect() {
    // Validate DB_URI first
    if (!process.env.DB_URI) {
      throw new Error("DB_URI environment variable is required");
    }

    // Return cached connection if available
    if (cached.conn) {
      console.log("✅ Using cached database connection");
      return cached.conn;
    }

    // Return existing promise if connection is in progress
    if (cached.promise) {
      console.log("⏳ Waiting for existing connection promise");
      return cached.promise;
    }

    console.log('🔄 Creating new MongoDB connection...');
    console.log('📍 Environment:', process.env.NODE_ENV);
    console.log('🔗 Mongoose version:', mongoose.version);

    // Create new connection promise
    cached.promise = this.createConnection();

    try {
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (error) {
      // Clear cache on error
      cached.promise = null;
      cached.conn = null;
      throw error;
    }
  }

  async createConnection() {
    try {
      // Close any existing connection
      if (mongoose.connection.readyState !== 0) {
        console.log('🔄 Closing existing connection...');
        await mongoose.disconnect();
      }

      // Connect with retry logic
      await this.connectWithRetry();

      // Wait for connection to be fully ready
      await this.waitForConnection();

      // Setup event handlers
      this.setupEventHandlers();

      console.log("✅ MongoDB connection established successfully!");
      
      // Safe logging with proper checks
      this.logConnectionInfo();

      return mongoose.connection;

    } catch (error) {
      console.error("❌ MongoDB connection failed:", error.message);
      this.handleConnectionError(error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async connectWithRetry() {
    let lastError;

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        this.connectionAttempts++;
        console.log(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`);

        // Create connection with timeout
        const connectPromise = mongoose.connect(process.env.DB_URI, this.connectionOptions);
        
        // Add safety timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout after 15 seconds')), 15000);
        });

        await Promise.race([connectPromise, timeoutPromise]);
        
        console.log(`✅ Connection successful on attempt ${this.connectionAttempts}`);
        return;

      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${this.connectionAttempts} failed:`, error.message);

        if (i === this.maxRetries - 1) {
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, i), 5000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async waitForConnection() {
    // Wait for connection to be fully established
    let attempts = 0;
    const maxAttempts = 10;

    while (mongoose.connection.readyState !== 1 && attempts < maxAttempts) {
      console.log(`⏳ Waiting for connection ready state... (${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error('Connection failed to reach ready state');
    }
  }

  logConnectionInfo() {
    try {
      console.log("🔌 Connection state:", this.getReadyStateText());
      
      // Safe database name access
      if (mongoose.connection.db) {
        const dbName = mongoose.connection.db.databaseName;
        if (dbName) {
          console.log("📊 Database name:", dbName);
        } else {
          console.log("📊 Database name: (extracting...)");
          // Try to extract from URI
          try {
            const uri = process.env.DB_URI;
            const dbFromUri = uri.split('/').pop().split('?')[0];
            console.log("📊 Database name (from URI):", dbFromUri);
          } catch (e) {
            console.log("📊 Database name: (unable to determine)");
          }
        }
      } else {
        console.log("📊 Database object not yet available");
      }

      // Log host info safely
      if (mongoose.connection.host) {
        console.log("🏠 Host:", mongoose.connection.host);
      }

    } catch (error) {
      console.log("📊 Connection info logging skipped due to:", error.message);
    }
  }

  setupEventHandlers() {
    // Clear existing listeners
    mongoose.connection.removeAllListeners();

    mongoose.connection.on('error', (err) => {
      console.error('🚨 MongoDB connection error:', err.message);
      this.clearCache();
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
      this.clearCache();
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });
  }

  clearCache() {
    cached.conn = null;
    cached.promise = null;
    cached.readyState = 0;
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
    console.error('🔍 Error Analysis:');
    
    if (error.message.includes('timeout')) {
      console.error('❌ TIMEOUT ERROR:');
      console.error('   - Database server may be overloaded');
      console.error('   - Network connectivity issues');
      console.error('   - Try upgrading MongoDB Atlas tier');
      console.error('   - Check Vercel region settings');
    } else if (error.name === 'MongooseServerSelectionError') {
      console.error('❌ SERVER SELECTION ERROR:');
      console.error('   - Check MongoDB Atlas cluster status');
      console.error('   - Verify IP whitelist: 0.0.0.0/0');
      console.error('   - Confirm connection string format');
      console.error('   - Verify database credentials');
    } else if (error.message.includes('Authentication')) {
      console.error('❌ AUTHENTICATION ERROR:');
      console.error('   - Check username/password in DB_URI');
      console.error('   - Verify user permissions');
    } else {
      console.error('❌ UNKNOWN ERROR:', error.message);
    }
  }

  async getHealthStatus() {
    try {
      const isConnected = mongoose.connection.readyState === 1;
      
      const health = {
        connection: {
          state: mongoose.connection.readyState,
          stateText: this.getReadyStateText(),
          isConnected,
          cached: !!cached.conn,
          attempts: this.connectionAttempts,
          mongooseVersion: mongoose.version
        },
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          hasDbUri: !!process.env.DB_URI,
          platform: process.env.VERCEL ? 'vercel' : 'local',
          region: process.env.VERCEL_REGION || 'unknown'
        }
      };

      // Add database info if available
      if (isConnected && mongoose.connection.db) {
        try {
          health.database = {
            name: mongoose.connection.db.databaseName || 'unknown',
            host: mongoose.connection.host || 'unknown'
          };

          // Quick ping test
          const startTime = Date.now();
          await mongoose.connection.db.admin().ping();
          health.connection.latency = Date.now() - startTime;
        } catch (dbError) {
          health.database = { error: dbError.message };
        }
      }

      return health;
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

  async testConnection() {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { connected: false, error: 'Not connected' };
      }

      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - startTime;

      return { 
        connected: true, 
        latency,
        cached: !!cached.conn,
        state: this.getReadyStateText()
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  // Main method to use in API routes
  async ensureConnection() {
    if (cached.conn && mongoose.connection.readyState === 1) {
      return cached.conn;
    }
    return await this.connect();
  }

  async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        this.clearCache();
        console.log("✅ Database disconnected");
      }
    } catch (error) {
      console.error("❌ Disconnect error:", error);
    }
  }
}

// Export singleton instance
const databaseConfig = new DatabaseConfig();
module.exports = databaseConfig;
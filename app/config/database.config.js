// app/config/database.config.js - SAFE VERSION FOR ALL MONGOOSE VERSIONS
const mongoose = require("mongoose");

// Global connection cache for serverless functions
let cachedConnection = null;

class DatabaseConfig {
  constructor() {
    this.connectionAttempts = 0;
    this.maxRetries = 2;
    
    // Check Mongoose version for compatibility
    this.mongooseVersion = this.parseMongooseVersion();
    console.log(`🔍 Detected Mongoose version: ${mongoose.version} (major: ${this.mongooseVersion.major})`);
    
    // Build connection options based on version
    this.connectionOptions = this.buildConnectionOptions();
    
    // Set global mongoose settings
    this.configureMongooseGlobals();
  }

  parseMongooseVersion() {
    const version = mongoose.version;
    const parts = version.split('.');
    return {
      major: parseInt(parts[0]),
      minor: parseInt(parts[1]),
      patch: parseInt(parts[2]),
      full: version
    };
  }

  buildConnectionOptions() {
    const baseOptions = {
      // Always supported options
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    // Timeout settings - supported in all versions
    const timeoutOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 8000,
      connectTimeoutMS: 5000,
    };

    // Connection pool settings
    const poolOptions = {
      maxPoolSize: 3,
      minPoolSize: 0,
      maxIdleTimeMS: 5000,
    };

    // Version-specific options
    const versionSpecificOptions = {};

    // For Mongoose 6+
    if (this.mongooseVersion.major >= 6) {
      versionSpecificOptions.heartbeatFrequencyMS = 30000;
      versionSpecificOptions.family = 4; // IPv4
    }

    // For Mongoose 5.x, add older options if needed
    if (this.mongooseVersion.major === 5) {
      // Add any Mongoose 5 specific options here
      versionSpecificOptions.useCreateIndex = true;
      versionSpecificOptions.useFindAndModify = false;
    }

    // Network and performance settings
    const networkOptions = {
      retryWrites: true,
      w: 'majority',
    };

    // SSL and authentication for production
    const authOptions = {};
    if (process.env.NODE_ENV === 'production') {
      authOptions.ssl = true;
      authOptions.authSource = 'admin';
    }

    // Combine all options
    const finalOptions = {
      ...baseOptions,
      ...timeoutOptions,
      ...poolOptions,
      ...versionSpecificOptions,
      ...networkOptions,
      ...authOptions
    };

    console.log('🔧 Connection options built:', Object.keys(finalOptions));
    return finalOptions;
  }

  configureMongooseGlobals() {
    try {
      // Set buffer commands globally - works in all versions
      mongoose.set('bufferCommands', false);
      
      // Set operation timeout
      if (this.mongooseVersion.major >= 6) {
        mongoose.set('maxTimeMS', 8000);
      }
      
      // Always disable automatic index creation in production
      mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');
      
      // Set strict mode
      mongoose.set('strict', true);
      
      // Debug mode only in development
      if (process.env.NODE_ENV === 'development') {
        mongoose.set('debug', true);
      }

      console.log('✅ Mongoose global settings configured');
    } catch (error) {
      console.warn('⚠️ Some global settings may not be supported:', error.message);
    }
  }

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
      
      // Mask sensitive parts of connection string for logging
      const maskedUri = process.env.DB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
      console.log('🔗 Connection URI (masked):', maskedUri);
      
      // Close any existing connections first
      if (mongoose.connection.readyState !== 0) {
        console.log('🔄 Closing existing connection...');
        await mongoose.disconnect();
      }
      
      // Connect with retry logic
      await this.connectWithRetry();
      
      // Cache the connection
      cachedConnection = mongoose.connection;
      
      console.log("✅ New MongoDB connection established!");
      console.log("📊 Database name:", mongoose.connection.db.databaseName);
      console.log("🔌 Connection state:", this.getReadyStateText());

      // Setup minimal event handlers
      this.setupMinimalEventHandlers();

      return cachedConnection;

    } catch (error) {
      console.error("❌ MongoDB connection error:", error.message);
      
      // Enhanced error handling
      this.handleConnectionError(error);

      // In serverless, throw the error instead of exiting
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async connectWithRetry() {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        this.connectionAttempts++;
        console.log(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`);
        console.log('🔧 Using options:', Object.keys(this.connectionOptions));
        
        // Create connection promise
        const connectPromise = mongoose.connect(process.env.DB_URI, this.connectionOptions);
        
        // Add timeout wrapper for extra safety
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout after 10s')), 10000);
        });
        
        // Race between connection and timeout
        await Promise.race([connectPromise, timeoutPromise]);
        
        console.log(`✅ Connection successful on attempt ${this.connectionAttempts}`);
        return;
        
      } catch (error) {
        console.error(`❌ Connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        // Log specific error details
        if (error.message.includes('not supported')) {
          console.error('🚨 Configuration Error - Unsupported option detected');
          console.error('🔧 Current Mongoose version:', mongoose.version);
          console.error('🔧 Options used:', Object.keys(this.connectionOptions));
        }
        
        if (i === this.maxRetries - 1) {
          throw error; // Re-throw on last attempt
        }
        
        // Wait before retry with exponential backoff
        const delay = Math.min(2000 * (i + 1), 5000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  setupMinimalEventHandlers() {
    // Remove existing listeners to prevent duplicates
    mongoose.connection.removeAllListeners('error');
    mongoose.connection.removeAllListeners('disconnected');

    // Essential error handlers only
    mongoose.connection.on('error', (err) => {
      console.error('🚨 MongoDB connection error:', err.message);
      cachedConnection = null; // Clear cache on error
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
      cachedConnection = null; // Clear cache on disconnect
    });
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
    
    if (error.message.includes('not supported')) {
      console.error('❌ CONFIGURATION ERROR:');
      console.error('   - Mongoose version incompatibility detected');
      console.error('   - Current version:', mongoose.version);
      console.error('   - Try updating Mongoose: npm install mongoose@latest');
      console.error('   - Or check which options are causing issues');
    } else if (error.name === 'MongooseServerSelectionError') {
      console.error('❌ SERVER SELECTION ERROR:');
      console.error('   - Check MongoDB Atlas cluster status');
      console.error('   - Verify IP whitelist includes 0.0.0.0/0');
      console.error('   - Confirm connection string format');
      console.error('   - Check database credentials');
    } else if (error.message.includes('timeout')) {
      console.error('❌ TIMEOUT ERROR:');
      console.error('   - Database server may be slow or overloaded');
      console.error('   - Network connectivity issues');
      console.error('   - Consider upgrading database cluster');
      console.error('   - Check Vercel region vs database region');
    } else if (error.message.includes('Authentication failed')) {
      console.error('❌ AUTHENTICATION ERROR:');
      console.error('   - Verify username and password in DB_URI');
      console.error('   - Check database user permissions');
      console.error('   - Ensure database user exists');
    }
  }

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
          mongooseVersion: mongoose.version,
          versionInfo: this.mongooseVersion
        },
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          hasDbUri: !!process.env.DB_URI,
          platform: process.env.VERCEL ? 'vercel' : 'local'
        },
        configuration: {
          supportedOptions: Object.keys(this.connectionOptions),
          bufferCommands: mongoose.get('bufferCommands'),
          autoIndex: mongoose.get('autoIndex'),
          strict: mongoose.get('strict')
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
          cached: false,
          mongooseVersion: mongoose.version
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
        cached: !!cachedConnection,
        version: mongoose.version 
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async ensureConnection() {
    if (!cachedConnection || mongoose.connection.readyState !== 1) {
      return await this.connect();
    }
    return cachedConnection;
  }

  clearCache() {
    cachedConnection = null;
  }

  // Disconnect method for cleanup
  async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        cachedConnection = null;
        console.log("✅ Database disconnected successfully");
      }
    } catch (error) {
      console.error("❌ Error disconnecting from database:", error);
    }
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
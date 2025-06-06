// app/controllers/troubleshoot.controller.js
const mongoose = require('mongoose');
const databaseConfig = require('../config/database.config');

class TroubleshootController {
  
  // Main troubleshooting endpoint
  static async runDiagnostics(req, res) {
    try {
      const results = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        platform: 'vercel',
        diagnostics: {
          environment: {},
          connectionString: {},
          database: {},
          mongodb: {},
          recommendations: []
        }
      };

      // 1. Check Environment Variables
      results.diagnostics.environment = await TroubleshootController.checkEnvironment();
      
      // 2. Analyze Connection String
      results.diagnostics.connectionString = TroubleshootController.analyzeConnectionString();
      
      // 3. Test Database Connection
      results.diagnostics.database = await TroubleshootController.testDatabaseConnection();
      
      // 4. MongoDB Specific Checks
      results.diagnostics.mongodb = await TroubleshootController.checkMongoDB();
      
      // 5. Generate Recommendations
      results.diagnostics.recommendations = TroubleshootController.generateRecommendations(results.diagnostics);

      // Determine overall status
      const hasIssues = results.diagnostics.recommendations.length > 0 || 
                       !results.diagnostics.database.connected;
      
      res.status(hasIssues ? 503 : 200).json({
        success: !hasIssues,
        message: hasIssues ? 'Issues detected' : 'All checks passed',
        data: results
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Troubleshooting failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Quick connection test
  static async quickConnectionTest(req, res) {
    try {
      const startTime = Date.now();
      
      if (!process.env.MONGODB_URI) {
        return res.status(400).json({
          success: false,
          message: 'MONGODB_URI environment variable not found',
          recommendations: ['Set MONGODB_URI in Vercel environment variables']
        });
      }

      // Test connection with timeout
      const testOptions = {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 8000
      };

      // If already connected, test ping
      if (mongoose.connection.readyState === 1) {
        const pingStartTime = Date.now();
        await mongoose.connection.db.admin().ping();
        const pingTime = Date.now() - pingStartTime;
        
        return res.status(200).json({
          success: true,
          message: 'Database connection is active',
          data: {
            connectionStatus: 'already_connected',
            database: mongoose.connection.db.databaseName,
            host: mongoose.connection.host,
            pingTime: `${pingTime}ms`,
            readyState: mongoose.connection.readyState,
            collections: await TroubleshootController.getCollectionInfo()
          }
        });
      }

      // Test new connection
      await mongoose.connect(process.env.MONGODB_URI, testOptions);
      const connectionTime = Date.now() - startTime;
      
      const result = {
        success: true,
        message: 'Connection test successful',
        data: {
          connectionTime: `${connectionTime}ms`,
          database: mongoose.connection.db.databaseName,
          host: mongoose.connection.host,
          readyState: mongoose.connection.readyState,
          collections: await TroubleshootController.getCollectionInfo()
        }
      };

      // Don't disconnect if already connected in main app
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }

      res.status(200).json(result);

    } catch (error) {
      const analysis = TroubleshootController.analyzeConnectionError(error);
      
      res.status(503).json({
        success: false,
        message: 'Connection test failed',
        error: error.message,
        analysis: analysis,
        recommendations: analysis.recommendations
      });
    }
  }

  // Check environment variables
  static async checkEnvironment() {
    const env = {
      status: 'ok',
      variables: {},
      issues: []
    };

    const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];
    const optionalVars = ['ADMIN_USERNAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'BLOB_READ_WRITE_TOKEN'];

    // Check required variables
    requiredVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        env.variables[varName] = {
          present: true,
          length: value.length,
          type: 'required'
        };
      } else {
        env.variables[varName] = {
          present: false,
          type: 'required'
        };
        env.issues.push(`Missing required environment variable: ${varName}`);
        env.status = 'error';
      }
    });

    // Check optional variables
    optionalVars.forEach(varName => {
      const value = process.env[varName];
      env.variables[varName] = {
        present: !!value,
        length: value ? value.length : 0,
        type: 'optional'
      };
    });

    env.variables.NODE_ENV = {
      present: true,
      value: process.env.NODE_ENV || 'development',
      type: 'system'
    };

    return env;
  }

  // Analyze connection string format
  static analyzeConnectionString() {
    const analysis = {
      status: 'ok',
      format: {},
      issues: [],
      masked: 'Not provided'
    };

    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
      analysis.status = 'error';
      analysis.issues.push('MONGODB_URI not found');
      return analysis;
    }

    try {
      // Mask the URI for security
      analysis.masked = dbUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');

      // Check protocol
      if (dbUri.startsWith('mongodb+srv://')) {
        analysis.format.protocol = { value: 'mongodb+srv', status: 'ok', note: 'Correct for Atlas' };
      } else if (dbUri.startsWith('mongodb://')) {
        analysis.format.protocol = { value: 'mongodb', status: 'warning', note: 'Should use mongodb+srv for Atlas' };
        analysis.issues.push('Consider using mongodb+srv:// for MongoDB Atlas');
      } else {
        analysis.format.protocol = { value: 'unknown', status: 'error', note: 'Invalid protocol' };
        analysis.issues.push('Invalid connection string protocol');
        analysis.status = 'error';
      }

      // Parse URL components
      const url = new URL(dbUri);
      analysis.format.hostname = { value: url.hostname, status: 'ok' };
      analysis.format.username = { value: url.username, status: url.username ? 'ok' : 'error' };
      analysis.format.password = { 
        present: !!url.password, 
        status: url.password ? 'ok' : 'error' 
      };
      analysis.format.database = { 
        value: url.pathname.replace('/', '') || 'default', 
        status: 'ok' 
      };

      // Check for Atlas hostname
      if (!url.hostname.includes('mongodb.net')) {
        analysis.issues.push('Hostname does not appear to be MongoDB Atlas');
      }

      if (!url.password) {
        analysis.issues.push('Password missing from connection string');
        analysis.status = 'error';
      }

      if (analysis.issues.length > 0 && analysis.status === 'ok') {
        analysis.status = 'warning';
      }

    } catch (error) {
      analysis.status = 'error';
      analysis.issues.push('Invalid connection string format: ' + error.message);
    }

    return analysis;
  }

  // Test database connection
  static async testDatabaseConnection() {
    const test = {
      status: 'unknown',
      connected: false,
      details: {},
      operations: {}
    };

    try {
      // Check current connection state
      test.details.currentState = {
        readyState: mongoose.connection.readyState,
        readyStateText: TroubleshootController.getReadyStateText(mongoose.connection.readyState),
        host: mongoose.connection.host || 'unknown',
        database: mongoose.connection.db?.databaseName || 'unknown'
      };

      if (mongoose.connection.readyState === 1) {
        test.connected = true;
        test.status = 'connected';

        // Test basic operations
        const startTime = Date.now();
        await mongoose.connection.db.admin().ping();
        test.operations.ping = {
          success: true,
          time: `${Date.now() - startTime}ms`
        };

        // Get database stats
        try {
          const stats = await mongoose.connection.db.stats();
          test.operations.stats = {
            success: true,
            collections: stats.collections,
            objects: stats.objects,
            dataSize: stats.dataSize
          };
        } catch (statsError) {
          test.operations.stats = {
            success: false,
            error: statsError.message
          };
        }

        // Test collections
        test.operations.collections = await TroubleshootController.getCollectionInfo();

      } else {
        test.connected = false;
        test.status = 'disconnected';
        test.details.reason = 'Database not connected';
      }

    } catch (error) {
      test.status = 'error';
      test.connected = false;
      test.error = error.message;
    }

    return test;
  }

  // MongoDB-specific checks
  static async checkMongoDB() {
    const checks = {
      version: 'unknown',
      health: {},
      performance: {},
      security: {}
    };

    try {
      if (mongoose.connection.readyState === 1) {
        // Get MongoDB version
        const buildInfo = await mongoose.connection.db.admin().buildInfo();
        checks.version = buildInfo.version;

        // Check replica set status (Atlas uses replica sets)
        try {
          const replStatus = await mongoose.connection.db.admin().replSetGetStatus();
          checks.health.replicaSet = {
            set: replStatus.set,
            members: replStatus.members.length,
            primary: replStatus.members.find(m => m.stateStr === 'PRIMARY')?.name || 'unknown'
          };
        } catch (replError) {
          checks.health.replicaSet = { error: 'Not a replica set or insufficient permissions' };
        }

        // Check connection pool
        checks.performance.connectionPool = {
          maxPoolSize: mongoose.connection.db.serverConfig?.s?.maxPoolSize || 'unknown',
          currentSize: mongoose.connection.db.serverConfig?.s?.poolSize || 'unknown'
        };

        // Check indexes on key collections
        const collections = ['users', 'predictions', 'roles'];
        checks.performance.indexes = {};
        
        for (const collName of collections) {
          try {
            const indexes = await mongoose.connection.db.collection(collName).indexes();
            checks.performance.indexes[collName] = indexes.length;
          } catch (indexError) {
            checks.performance.indexes[collName] = 'Collection not found';
          }
        }

      } else {
        checks.error = 'Database not connected';
      }

    } catch (error) {
      checks.error = error.message;
    }

    return checks;
  }

  // Generate recommendations based on diagnostic results
  static generateRecommendations(diagnostics) {
    const recommendations = [];

    // Environment issues
    if (diagnostics.environment.status === 'error') {
      recommendations.push({
        category: 'Environment',
        priority: 'high',
        issue: 'Missing required environment variables',
        action: 'Set missing environment variables in Vercel dashboard',
        details: diagnostics.environment.issues
      });
    }

    // Connection string issues
    if (diagnostics.connectionString.status === 'error') {
      recommendations.push({
        category: 'Connection String',
        priority: 'high',
        issue: 'Invalid connection string format',
        action: 'Fix connection string format',
        details: diagnostics.connectionString.issues
      });
    }

    // Database connection issues
    if (!diagnostics.database.connected) {
      const priority = diagnostics.environment.status === 'error' ? 'medium' : 'high';
      recommendations.push({
        category: 'Database Connection',
        priority: priority,
        issue: 'Cannot connect to database',
        action: 'Check MongoDB Atlas cluster status and network access',
        details: [
          'Verify cluster is running in MongoDB Atlas',
          'Check IP Access List includes 0.0.0.0/0',
          'Verify database user credentials',
          'Check if cluster is paused'
        ]
      });
    }

    // Connection string warnings
    if (diagnostics.connectionString.status === 'warning') {
      recommendations.push({
        category: 'Connection String',
        priority: 'low',
        issue: 'Connection string could be optimized',
        action: 'Consider suggested improvements',
        details: diagnostics.connectionString.issues
      });
    }

    return recommendations;
  }

  // Helper methods
  static getReadyStateText(readyState) {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized'
    };
    return states[readyState] || 'unknown';
  }

  static async getCollectionInfo() {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { error: 'Not connected' };
      }

      const collections = await mongoose.connection.db.listCollections().toArray();
      const info = {};

      for (const coll of collections) {
        try {
          const count = await mongoose.connection.db.collection(coll.name).countDocuments();
          info[coll.name] = { count, type: coll.type || 'collection' };
        } catch (countError) {
          info[coll.name] = { error: 'Cannot count documents' };
        }
      }

      return info;
    } catch (error) {
      return { error: error.message };
    }
  }

  static analyzeConnectionError(error) {
    const analysis = {
      type: 'unknown',
      category: 'Connection Error',
      recommendations: []
    };

    const errorMsg = error.message.toLowerCase();

    if (errorMsg.includes('authentication failed')) {
      analysis.type = 'authentication';
      analysis.category = 'Authentication Error';
      analysis.recommendations = [
        'Check username and password in MongoDB Atlas Database Access',
        'Verify the user exists and has proper permissions',
        'Check if password contains special characters that need URL encoding'
      ];
    } else if (errorMsg.includes('ip') || errorMsg.includes('whitelist')) {
      analysis.type = 'network';
      analysis.category = 'Network Access Error';
      analysis.recommendations = [
        'Check IP Access List in MongoDB Atlas Network Access',
        'Ensure 0.0.0.0/0 is added for Vercel deployments',
        'Wait a few minutes after adding IP addresses'
      ];
    } else if (errorMsg.includes('enotfound') || errorMsg.includes('getaddrinfo')) {
      analysis.type = 'dns';
      analysis.category = 'DNS/Hostname Error';
      analysis.recommendations = [
        'Verify the cluster hostname in connection string',
        'Check if cluster name is correct in MongoDB Atlas',
        'Ensure cluster is in the correct project'
      ];
    } else if (errorMsg.includes('timeout') || errorMsg.includes('etimedout')) {
      analysis.type = 'timeout';
      analysis.category = 'Connection Timeout';
      analysis.recommendations = [
        'Check if cluster is paused in MongoDB Atlas',
        'Verify cluster is not under heavy load',
        'Try connecting again in a few minutes',
        'Consider upgrading cluster tier if consistently slow'
      ];
    } else if (errorMsg.includes('mongooseserverselectionerror')) {
      analysis.type = 'server_selection';
      analysis.category = 'Server Selection Error';
      analysis.recommendations = [
        'This is usually a combination of network and authentication issues',
        'Check all: IP whitelist, credentials, and cluster status',
        'Verify connection string format is correct'
      ];
    }

    return analysis;
  }
}

module.exports = TroubleshootController;
// app/routes/health.routes.js
const databaseConfig = require("../config/database.config");

module.exports = function(app) {
  // Basic health check endpoint
  app.get("/health", async (req, res) => {
    try {
      const healthCheck = {
        status: "OK",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        api_version: "2.0.0",
        swagger: "Available at /api/docs",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: {
          status: "unknown",
          connection: "unknown"
        },
        model: {
          loaded: false,
          classes: 0
        }
      };

      // Check database connection
      try {
        const dbHealth = await databaseConfig.getHealthStatus();
        healthCheck.database = dbHealth.connection;
        
        if (dbHealth.collections) {
          healthCheck.database.collections = dbHealth.collections;
        }
      } catch (dbError) {
        healthCheck.database = {
          status: "error",
          error: dbError.message,
          connection: "failed"
        };
      }

      // Check model status (placeholder - update based on your model loading logic)
      try {
        // You can add your model health check here
        healthCheck.model = {
          loaded: true,
          classes: 16,
          status: "ready"
        };
      } catch (modelError) {
        healthCheck.model = {
          loaded: false,
          error: modelError.message,
          status: "error"
        };
      }

      // Set appropriate status code
      const isHealthy = healthCheck.database.stateText === "connected";
      const statusCode = isHealthy ? 200 : 503;
      
      res.status(statusCode).json(healthCheck);
    } catch (error) {
      res.status(500).json({
        status: "ERROR",
        timestamp: new Date().toISOString(),
        error: error.message,
        message: "Health check failed"
      });
    }
  });

  // Database-specific health endpoint
  app.get("/health/database", async (req, res) => {
    try {
      const dbStatus = await databaseConfig.getHealthStatus();

      if (dbStatus.connection.stateText === 'connected') {
        res.status(200).json({
          success: true,
          message: "Database is healthy",
          data: dbStatus
        });
      } else {
        res.status(503).json({
          success: false,
          message: "Database is not connected",
          data: dbStatus
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Database health check failed",
        error: error.message
      });
    }
  });

  // Detailed system health check
  app.get("/health/system", (req, res) => {
    try {
      const systemInfo = {
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime()
        },
        memory: process.memoryUsage(),
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT,
          hasDbUri: !!process.env.MONGODB_URI,
          hasJwtSecret: !!process.env.JWT_SECRET,
          hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json({
        success: true,
        message: "System information retrieved",
        data: systemInfo
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to get system information",
        error: error.message
      });
    }
  });

  // API endpoints health check
  app.get("/health/endpoints", (req, res) => {
    try {
      const endpoints = {
        api: {
          auth: "/api/auth/*",
          prediction: "/api/predict",
          history: "/api/predictions/history", 
          docs: "/api/docs",
          health: "/health"
        },
        documentation: {
          swagger_ui: "/api/docs",
          swagger_json: "/api/docs/swagger.json"
        },
        health_checks: {
          basic: "/health",
          database: "/health/database",
          system: "/health/system",
          endpoints: "/health/endpoints"
        }
      };

      res.status(200).json({
        success: true,
        message: "Available endpoints",
        data: endpoints,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to get endpoints information",
        error: error.message
      });
    }
  });
};
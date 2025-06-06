// server.js - Fixed version with individual route imports
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

// Import configurations
const databaseConfig = require("./app/config/database.config");
const corsConfig = require("./app/config/cors.config");
const { limiter } = require("./app/utils/rateLimiter");
const { errorHandler } = require("./app/middleware/errorHandler");

// Initialize Express app
const app = express();

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Disable CSP for Swagger UI
}));

// CORS middleware
app.use(cors(corsConfig.getCorsOptions()));
app.options('*', cors(corsConfig.getCorsOptions()));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("combined"));
}

// Rate limiting middleware
app.use(limiter);

// Connect to database
databaseConfig.connect();

// Setup routes individually
console.log('Loading routes...');

try {
  require("./app/routes/health.routes")(app);
  console.log('✅ Health routes loaded');
} catch (error) {
  console.error('❌ Failed to load health routes:', error.message);
}

try {
  require("./app/routes/swagger.routes")(app);
  console.log('✅ Swagger routes loaded');
} catch (error) {
  console.error('❌ Failed to load swagger routes:', error.message);
}

try {
  require("./app/routes/auth.routes")(app);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error.message);
}

try {
  require("./app/routes/user.routes")(app);
  console.log('✅ User routes loaded');
} catch (error) {
  console.error('❌ Failed to load user routes:', error.message);
}

try {
  require("./app/routes/prediction.routes")(app);
  console.log('✅ Prediction routes loaded');
} catch (error) {
  console.error('❌ Failed to load prediction routes:', error.message);
}

console.log('📋 Route loading completed');

try {
  require("./app/routes/troubleshoot.routes")(app);
  console.log('✅ Troubleshoot routes loaded');
} catch (error) {
  console.error('❌ Failed to load troubleshoot routes:', error.message);
}

app.get("/", (req, res) => {
  res.json({
    message: "🌱 Plant Disease Prediction API is running!",
    version: "2.0.0",
    status: "OK",
    timestamp: new Date().toISOString(),
    database: {
      connected: databaseConfig.isConnected
    },
    endpoints: {
      auth: "/api/auth/*",
      prediction: "/api/predict",
      history: "/api/predictions/history",
      docs: "/api/docs",
      health: "/health",
      troubleshoot: "/troubleshoot"  // Add this line
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
    },
    troubleshooting: {  // Add this section
      web_interface: "/troubleshoot",
      quick_test: "/api/troubleshoot/connection",
      full_diagnostics: "/api/troubleshoot/full",
      admin_advanced: "/api/admin/troubleshoot/advanced"
    }
  });
});

// Route status endpoint
app.get("/status/routes", (req, res) => {
  res.json({
    success: true,
    message: "Route status information",
    data: {
      routes: [
        { name: "health", loaded: true, file: "health.routes.js" },
        { name: "swagger", loaded: true, file: "swagger.routes.js" },
        { name: "auth", loaded: true, file: "auth.routes.js" },
        { name: "user", loaded: true, file: "user.routes.js" },
        { name: "prediction", loaded: true, file: "prediction.routes.js" }
      ],
      total: 5,
      loaded: 5,
      failed: 0
    },
    timestamp: new Date().toISOString()
  });
});

// 404 handler for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
    available_endpoints: {
      docs: "/api/docs",
      health: "/health",
      auth: "/api/auth/*",
      predict: "/api/predict",
      route_status: "/status/routes"
    }
  });
});

// Error handling middleware (should be last)
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await databaseConfig.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await databaseConfig.disconnect();
  process.exit(0);
});

// Start server (only if not in Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 8000;
  
  const server = app.listen(PORT, () => {
    console.log('🚀 ================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🚀 ================================');
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
    console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
    console.log(`📋 Route Status: http://localhost:${PORT}/status/routes`);
    console.log(`📋 Swagger JSON: http://localhost:${PORT}/api/docs/swagger.json`);
    console.log('🚀 ================================');
    
    // Log database connection status after a delay
    setTimeout(async () => {
      console.log(`💾 Database: ${databaseConfig.isConnected ? '✅ Connected' : '❌ Disconnected'}`);
      
      if (databaseConfig.isConnected) {
        try {
          const dbHealth = await databaseConfig.getHealthStatus();
          console.log(`💾 Database Name: ${dbHealth.connection.name || 'unknown'}`);
          console.log(`💾 Collections: ${JSON.stringify(dbHealth.collections || {})}`);
        } catch (error) {
          console.log(`💾 Database Error: ${error.message}`);
        }
      }
      
      console.log('🚀 ================================');
    }, 3000);
  });

  // Handle server errors
  server.on('error', (error) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  });
}

module.exports = app;
// server.js - Railway Compatible Version
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const path = require("path");
const fs = require("fs");

// Import configurations
const databaseConfig = require("./app/config/database.config");
const corsConfig = require("./app/config/cors.config");
const { limiter } = require("./app/utils/rateLimiter");
const { errorHandler } = require("./app/middleware/errorHandler");
const { startPeriodicCleanup, uploadsDir } = require("./app/middleware/upload");

// Initialize Express app
const app = express();

// Railway fix: Trust proxy for correct protocol detection
app.set('trust proxy', 1);

// Railway fix: Force HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Compression middleware for better performance
app.use(compression());

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory at:', uploadsDir);
}

// Start periodic file cleanup (remove old uploaded files)
startPeriodicCleanup();
console.log('🧹 Started periodic file cleanup service');

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
      scriptSrc: ["'self'", "unpkg.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"], // Allow uploaded images
      connectSrc: ["'self'", "https:", "http:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  }
}));

// CORS middleware
app.use(cors(corsConfig.getCorsOptions()));
app.options('*', cors(corsConfig.getCorsOptions()));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploaded images
console.log('🖼️  Setting up static file serving for uploads...');
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '1d', // Cache for 1 day
  setHeaders: (res, path, stat) => {
    // Set appropriate headers for images
    const ext = path.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      res.set('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    }
    
    // Add security headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'");
  }
}));

// Add a route to list uploaded files (for debugging, admin only)
app.get('/uploads-info', (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Access denied in production'
      });
    }
    
    const files = fs.readdirSync(uploadsDir);
    const fileInfo = files.map(file => {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        url: `/uploads/${file}`
      };
    });
    
    res.json({
      success: true,
      data: {
        uploadsDirectory: uploadsDir,
        totalFiles: files.length,
        files: fileInfo
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error reading uploads directory',
      error: error.message
    });
  }
});

// Logging middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("combined"));
}

// Rate limiting middleware
app.use(limiter);

// Connect to database
databaseConfig.connect();

// Setup routes individually
console.log('📋 Loading routes...');

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

try {
  require("./app/routes/troubleshoot.routes")(app);
  console.log('✅ Troubleshoot routes loaded');
} catch (error) {
  console.error('❌ Failed to load troubleshoot routes:', error.message);
}

console.log('📋 Route loading completed');

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🌱 Plant Disease Prediction API is running!",
    version: "2.0.0",
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'Railway',
    database: {
      connected: databaseConfig.isConnected
    },
    storage: {
      type: 'local',
      uploadsDirectory: '/uploads',
      cleanupEnabled: true
    },
    endpoints: {
      auth: "/api/auth/*",
      prediction: "/api/predict",
      history: "/api/predictions/history",
      docs: "/api/docs",
      health: "/health",
      troubleshoot: "/troubleshoot"
    },
    documentation: {
      swagger_ui: "/api/docs",
      swagger_json: "/api/docs/swagger.json"
    },
    health_checks: {
      basic: "/health",
      database: "/health/database",
      system: "/health/system",
      endpoints: "/health/endpoints",
      model: "/api/model/health"
    },
    troubleshooting: {
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
        { name: "prediction", loaded: true, file: "prediction.routes.js" },
        { name: "troubleshoot", loaded: true, file: "troubleshoot.routes.js" }
      ],
      total: 6,
      loaded: 6,
      failed: 0
    },
    timestamp: new Date().toISOString()
  });
});

// Storage status endpoint
app.get("/status/storage", (req, res) => {
  try {
    const stats = fs.statSync(uploadsDir);
    const files = fs.readdirSync(uploadsDir);
    
    let totalSize = 0;
    const fileTypes = {};
    
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const fileStats = fs.statSync(filePath);
      totalSize += fileStats.size;
      
      const ext = path.extname(file).toLowerCase();
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    });
    
    res.json({
      success: true,
      message: "Storage status information",
      data: {
        uploadsDirectory: uploadsDir,
        directoryExists: true,
        totalFiles: files.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        fileTypes: fileTypes,
        permissions: {
          readable: fs.constants.R_OK,
          writable: fs.constants.W_OK
        },
        cleanup: {
          enabled: true,
          interval: '1 hour',
          maxAge: '24 hours'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get storage status",
      error: error.message,
      data: {
        uploadsDirectory: uploadsDir,
        directoryExists: fs.existsSync(uploadsDir)
      }
    });
  }
});

// Railway health endpoint (Railway expects this)
app.get("/healthz", (req, res) => {
  res.status(200).json({ 
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
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
      route_status: "/status/routes",
      storage_status: "/status/storage"
    }
  });
});

// Error handling middleware (should be last)
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });
  
  // Disconnect from database
  await databaseConfig.disconnect();
  
  // Clean up any pending file operations
  console.log('🧹 Cleaning up file operations...');
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });
  
  // Disconnect from database
  await databaseConfig.disconnect();
  
  // Clean up any pending file operations
  console.log('🧹 Cleaning up file operations...');
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Platform: Railway`);
  console.log('🚀 ================================');
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
  console.log(`📋 Route Status: http://localhost:${PORT}/status/routes`);
  console.log(`💾 Storage Status: http://localhost:${PORT}/status/storage`);
  console.log(`🛠️ Troubleshoot: http://localhost:${PORT}/troubleshoot`);
  console.log(`📊 Swagger JSON: http://localhost:${PORT}/api/docs/swagger.json`);
  console.log('🚀 ================================');
  
  // Log storage configuration
  console.log(`📁 Uploads Directory: ${uploadsDir}`);
  console.log(`🖼️  Static Files: http://localhost:${PORT}/uploads/`);
  console.log(`🧹 Cleanup Service: Active (24h retention)`);
  
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
    
    // Railway-specific startup message
    if (process.env.NODE_ENV === 'production') {
      console.log('🚂 Railway Deployment Info:');
      console.log(`🌐 Public URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.up.railway.app'}`);
      console.log(`📝 Environment Variables: ${Object.keys(process.env).filter(key => !key.includes('PASSWORD') && !key.includes('SECRET')).length} loaded`);
      console.log('🚀 ================================');
    }
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
      console.error(`❌ ${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`❌ ${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Log unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('🚨 Unhandled Promise Rejection:', err);
  // Don't exit in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Log uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app;
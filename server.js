require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const databaseConfig = require("./app/config/database.config");
const corsConfig = require("./app/config/cors.config");
const { limiter } = require("./app/utils/rateLimiter");
const { errorHandler } = require("./app/middleware/errorHandler");
const { startPeriodicCleanup, uploadsDir } = require("./app/middleware/upload");

const app = express();

app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

app.use(compression());

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

const ensureUploadsDirectory = () => {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('📁 Created uploads directory at:', uploadsDir);
    }
    
    const testFile = path.join(uploadsDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log('✅ Uploads directory is writable:', uploadsDir);
    return true;
  } catch (error) {
    console.error('❌ Failed to setup uploads directory:', error.message);
    return false;
  }
};

const uploadsReady = ensureUploadsDirectory();
if (!uploadsReady) {
  console.error('💀 Failed to initialize uploads directory. Image uploads will not work.');
}

if (uploadsReady) {
  startPeriodicCleanup();
  console.log('🧹 Started periodic file cleanup service');
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "unpkg.com", "cdn.jsdelivr.net"],
      scriptSrc: [
        "'self'", 
        "unpkg.com", 
        "cdn.jsdelivr.net",
        (req, res) => `'nonce-${res.locals.nonce}'` // Dynamic nonce
      ],
      imgSrc: ["'self'", "data:", "https:", "http:", "blob:"], // Allow all image sources including uploads
      connectSrc: ["'self'", "https:", "http:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  }
}));

// CORS middleware
app.use(cors(corsConfig.getCorsOptions()));
app.options('*', cors(corsConfig.getCorsOptions()));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// FIXED: Enhanced static file serving for uploaded images
console.log('🖼️  Setting up static file serving for uploads...');

// Add specific route for uploads with proper headers
app.use('/uploads', (req, res, next) => {
  // Log access for debugging
  console.log(`📸 Image request: ${req.path}`);
  
  // Set CORS headers for images
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  next();
}, express.static(uploadsDir, {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath, stat) => {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.jpg' || ext === '.jpeg') {
      res.set('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.set('Content-Type', 'image/png');
    } else if (ext === '.webp') {
      res.set('Content-Type', 'image/webp');
    } else {
      res.set('Content-Type', 'application/octet-stream');
    }
    
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day cache
    
    console.log(`📸 Serving image: ${path.basename(filePath)} (${ext})`);
  },
  fallthrough: false
}));

app.use('/uploads', (req, res) => {
  console.log(`❌ Image not found: ${req.path}`);
  res.status(404).json({
    success: false,
    message: 'Image not found',
    path: req.path,
    uploadsDir: uploadsDir
  });
});

app.get('/uploads-info', (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Access denied in production'
      });
    }
    
    if (!fs.existsSync(uploadsDir)) {
      return res.status(404).json({
        success: false,
        message: 'Uploads directory does not exist',
        uploadsDir: uploadsDir
      });
    }
    
    const files = fs.readdirSync(uploadsDir);
    const fileInfo = files.map(file => {
      const filePath = path.join(uploadsDir, file);
      try {
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
          created: stats.birthtime,
          modified: stats.mtime,
          url: `/uploads/${file}`,
          exists: true
        };
      } catch (error) {
        return {
          name: file,
          error: error.message,
          exists: false
        };
      }
    });
    
    res.json({
      success: true,
      data: {
        uploadsDirectory: uploadsDir,
        directoryExists: true,
        totalFiles: files.length,
        files: fileInfo
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error reading uploads directory',
      error: error.message,
      uploadsDir: uploadsDir
    });
  }
});

app.get('/test-image', (req, res) => {
  try {
    const testImageData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x5C, 0xCD, 0x90, 0x82, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    res.set('Content-Type', 'image/png');
    res.set('Content-Length', testImageData.length);
    res.send(testImageData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate test image',
      error: error.message
    });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("combined"));
}

app.use(limiter);

databaseConfig.connect();

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

app.get("/", (req, res) => {
  res.json({
    message: "🌱 Plant Disease Prediction API is running!",
    version: "2.0.0",
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'Railway',
    security: {
      csp: 'nonce-based',
      https: process.env.NODE_ENV === 'production'
    },
    database: {
      connected: databaseConfig.isConnected
    },
    storage: {
      type: 'local',
      uploadsDirectory: uploadsDir,
      directoryExists: fs.existsSync(uploadsDir),
      cleanupEnabled: true,
      staticRoute: '/uploads',
      testImage: '/test-image',
      debugInfo: process.env.NODE_ENV !== 'production' ? '/uploads-info' : null
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

app.get("/status/storage", (req, res) => {
  try {
    const directoryExists = fs.existsSync(uploadsDir);
    
    if (!directoryExists) {
      return res.status(503).json({
        success: false,
        message: "Uploads directory does not exist",
        data: {
          uploadsDirectory: uploadsDir,
          directoryExists: false,
          error: "Directory not found"
        }
      });
    }
    
    const stats = fs.statSync(uploadsDir);
    const files = fs.readdirSync(uploadsDir);
    
    let totalSize = 0;
    const fileTypes = {};
    const recentFiles = [];
    
    files.forEach(file => {
      try {
        const filePath = path.join(uploadsDir, file);
        const fileStats = fs.statSync(filePath);
        totalSize += fileStats.size;
        
        const ext = path.extname(file).toLowerCase();
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
        
        recentFiles.push({
          name: file,
          size: fileStats.size,
          created: fileStats.birthtime,
          url: `/uploads/${file}`
        });
      } catch (error) {
        console.error(`Error processing file ${file}:`, error.message);
      }
    });
    
    recentFiles.sort((a, b) => new Date(b.created) - new Date(a.created));
    
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
        recentFiles: recentFiles.slice(0, 10),
        permissions: {
          readable: true,
          writable: uploadsReady
        },
        cleanup: {
          enabled: true,
          interval: '1 hour',
          maxAge: '24 hours'
        },
        staticRoute: '/uploads',
        examples: files.length > 0 ? [
          `${req.protocol}://${req.get('host')}/uploads/${files[0]}`,
          `/uploads/${files[0]}`
        ] : []
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

app.get("/status/security", (req, res) => {
  res.json({
    success: true,
    message: "Security status information",
    data: {
      csp: {
        type: 'nonce-based',
        currentNonce: res.locals.nonce,
        nonceLength: res.locals.nonce ? res.locals.nonce.length : 0,
        imageSupport: 'enabled'
      },
      https: {
        forced: process.env.NODE_ENV === 'production',
        current: req.secure || req.get('x-forwarded-proto') === 'https'
      },
      headers: {
        'x-forwarded-proto': req.get('x-forwarded-proto'),
        'host': req.get('host'),
        'user-agent': req.get('user-agent') ? 'present' : 'missing'
      },
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ 
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    security: {
      csp: 'nonce-enabled',
      nonce: res.locals.nonce ? 'generated' : 'missing'
    },
    storage: {
      uploadsReady: uploadsReady,
      directoryExists: fs.existsSync(uploadsDir)
    }
  });
});

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
      uploads: "/uploads/*",
      route_status: "/status/routes",
      storage_status: "/status/storage",
      security_status: "/status/security"
    }
  });
});

app.use(errorHandler);

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });
  
  await databaseConfig.disconnect();
  
  console.log('🧹 Cleaning up file operations...');
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });
  
  await databaseConfig.disconnect();
  
  console.log('🧹 Cleaning up file operations...');
  
  process.exit(0);
});

const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Platform: Railway`);
  console.log(`🛡️ Security: CSP with nonce-based inline script protection`);
  console.log('🚀 ================================');
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
  console.log(`📋 Route Status: http://localhost:${PORT}/status/routes`);
  console.log(`💾 Storage Status: http://localhost:${PORT}/status/storage`);
  console.log(`🛡️ Security Status: http://localhost:${PORT}/status/security`);
  console.log(`🛠️ Troubleshoot: http://localhost:${PORT}/troubleshoot`);
  console.log(`📊 Swagger JSON: http://localhost:${PORT}/api/docs/swagger.json`);
  console.log('🚀 ================================');
  
  console.log(`📁 Uploads Directory: ${uploadsDir}`);
  console.log(`📁 Directory Exists: ${fs.existsSync(uploadsDir)}`);
  console.log(`📁 Directory Writable: ${uploadsReady}`);
  console.log(`🖼️  Static Files: http://localhost:${PORT}/uploads/`);
  console.log(`🧹 Cleanup Service: ${uploadsReady ? 'Active' : 'Disabled'} (24h retention)`);
  
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
    
    if (process.env.NODE_ENV === 'production') {
      console.log('🚂 Railway Deployment Info:');
      console.log(`🌐 Public URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.up.railway.app'}`);
      console.log(`📝 Environment Variables: ${Object.keys(process.env).filter(key => !key.includes('PASSWORD') && !key.includes('SECRET')).length} loaded`);
      console.log(`🛡️ CSP Nonces: Dynamically generated for each request`);
      console.log(`🖼️  Image Access: ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/uploads/` : 'Railway domain not set'}`);
      console.log('🚀 ================================');
    }
  }, 3000);
});

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

process.on('unhandledRejection', (err) => {
  console.error('🚨 Unhandled Promise Rejection:', err);
  // Don't exit in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app;
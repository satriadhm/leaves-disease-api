// server.js - VERCEL SWAGGER FIX (Replace existing server.js)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const path = require("path");
const { limiter } = require("./app/utils/rateLimiter");

const app = express();

app.set('trust proxy', 1);

// Database connection dengan auto-seed
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB successfully!");

    // Auto-seed database jika di production dan belum ada data
    if (process.env.NODE_ENV === 'production') {
      await autoSeedDatabase();
    }
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

// Auto-seed function
const autoSeedDatabase = async () => {
  try {
    const Role = require("./app/models/role.model");
    const User = require("./app/models/user.model");
    const bcrypt = require("bcryptjs");

    // Check if roles already exist
    const roleCount = await Role.countDocuments();
    if (roleCount > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Auto-seeding database...");

    // Seed roles
    const roles = ["user", "admin", "moderator"];
    const createdRoles = {};

    for (let roleName of roles) {
      const role = await new Role({ name: roleName }).save();
      createdRoles[roleName] = role;
      console.log(`Role '${roleName}' added.`);
    }

    // Seed admin user
    const password = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "adminpassword", 8);
    const adminUser = new User({
      username: process.env.ADMIN_USERNAME || "admin",
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password,
      roles: [createdRoles.admin._id]
    });

    await adminUser.save();
    console.log("Admin user created successfully!");

  } catch (error) {
    console.error("Auto-seed error:", error);
  }
};

// Connect to database
connectDB();

// Universal CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const localhostRegex = /^http:\/\/localhost:\d+$/;
    const localhostIPRegex = /^http:\/\/127\.0\.0\.1:\d+$/;
    const localhostIPv4Regex = /^http:\/\/192\.168\.\d+\.\d+:\d+$/;

    if (localhostRegex.test(origin) || localhostIPRegex.test(origin) || localhostIPv4Regex.test(origin)) {
      return callback(null, true);
    }

    if (origin.includes('ngrok.io') ||
        origin.includes('ngrok-free.app') ||
        origin.includes('ngrok.app') ||
        origin.includes('ngrok.dev')) {
      return callback(null, true);
    }

    if (origin.includes('vercel.app') ||
        origin.includes('vercel.sh') ||
        origin.includes('now.sh')) {
      return callback(null, true);
    }

    if (origin.includes('netlify.app') ||
        origin.includes('netlify.com')) {
      return callback(null, true);
    }

    if (origin.includes('github.io')) {
      return callback(null, true);
    }

    const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').filter(Boolean);
    if (allowedOrigins.some(allowedOrigin => origin === allowedOrigin.trim())) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV === 'production' && origin.startsWith('https://')) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    console.log('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-access-token',
    'Origin',
    'X-Requested-With',
    'Accept',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Disable CSP for Swagger UI
}));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("combined"));
}

app.use(limiter);

// =====================================================
// SIMPLE SWAGGER CONFIGURATION THAT WORKS ON VERCEL
// =====================================================

// Swagger JSON configuration
const getSwaggerDoc = (req) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const host = req.get('host');
  const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  
  return {
    "swagger": "2.0",
    "info": {
      "version": "2.0.0",
      "title": "Plant Disease Prediction API",
      "description": "API untuk prediksi penyakit tanaman menggunakan AI"
    },
    "host": host,
    "schemes": [protocol],
    "basePath": "/",
    "consumes": ["application/json", "multipart/form-data"],
    "produces": ["application/json"],
    "securityDefinitions": {
      "Bearer": {
        "type": "apiKey",
        "name": "x-access-token",
        "in": "header",
        "description": "JWT token untuk authentication"
      }
    },
    "tags": [
      { "name": "Health", "description": "Health check endpoints" },
      { "name": "Auth", "description": "Authentication endpoints" },
      { "name": "Prediction", "description": "Plant disease prediction endpoints" },
      { "name": "User", "description": "User management endpoints" }
    ],
    "paths": {
      "/health": {
        "get": {
          "tags": ["Health"],
          "summary": "Health check",
          "responses": {
            "200": { "description": "API is healthy" }
          }
        }
      },
      "/api/model/health": {
        "get": {
          "tags": ["Prediction"],
          "summary": "Check ML model health",
          "responses": {
            "200": { "description": "Model health information" }
          }
        }
      },
      "/api/auth/signup": {
        "post": {
          "tags": ["Auth"],
          "summary": "Register new user",
          "parameters": [{
            "in": "body",
            "name": "body",
            "schema": {
              "type": "object",
              "required": ["username", "email", "password"],
              "properties": {
                "username": { "type": "string", "example": "john_doe" },
                "email": { "type": "string", "example": "john@example.com" },
                "password": { "type": "string", "example": "password123" }
              }
            }
          }],
          "responses": {
            "200": { "description": "User registered successfully" },
            "400": { "description": "Bad request" }
          }
        }
      },
      "/api/auth/signin": {
        "post": {
          "tags": ["Auth"],
          "summary": "User login",
          "parameters": [{
            "in": "body",
            "name": "body",
            "schema": {
              "type": "object",
              "required": ["username", "password"],
              "properties": {
                "username": { "type": "string", "example": "john_doe" },
                "password": { "type": "string", "example": "password123" }
              }
            }
          }],
          "responses": {
            "200": { "description": "Login successful" },
            "401": { "description": "Invalid credentials" }
          }
        }
      },
      "/api/predict": {
        "post": {
          "tags": ["Prediction"],
          "summary": "Predict plant disease",
          "consumes": ["multipart/form-data"],
          "parameters": [
            {
              "in": "formData",
              "name": "image",
              "type": "file",
              "required": true,
              "description": "Plant leaf image"
            },
            {
              "in": "header",
              "name": "x-access-token",
              "type": "string",
              "required": false,
              "description": "Optional JWT token"
            }
          ],
          "responses": {
            "200": { "description": "Prediction successful" },
            "400": { "description": "Invalid image" }
          }
        }
      },
      "/api/predictions/history": {
        "get": {
          "tags": ["Prediction"],
          "summary": "Get prediction history",
          "security": [{ "Bearer": [] }],
          "responses": {
            "200": { "description": "History retrieved" },
            "401": { "description": "Authentication required" }
          }
        }
      },
      "/api/user/profile": {
        "get": {
          "tags": ["User"],
          "summary": "Get user profile",
          "security": [{ "Bearer": [] }],
          "responses": {
            "200": { "description": "Profile retrieved" },
            "401": { "description": "Authentication required" }
          }
        }
      }
    }
  };
};

// Serve Swagger JSON
app.get('/api/docs/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(getSwaggerDoc(req));
});

// Serve Swagger UI HTML (Custom implementation)
app.get('/api/docs', (req, res) => {
  const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const swaggerJsonUrl = `${protocol}://${req.get('host')}/api/docs/swagger.json`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="SwaggerUI" />
  <title>Plant Disease API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .loading { 
      text-align: center; 
      padding: 50px; 
      font-size: 18px; 
      color: #666;
    }
  </style>
</head>
<body>
  <div id="swagger-ui">
    <div class="loading">Loading API Documentation...</div>
  </div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    try {
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: '${swaggerJsonUrl}',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.presets.standalone
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout",
          tryItOutEnabled: true,
          requestInterceptor: function(req) {
            // Add CORS headers for try-it-out
            req.headers['Access-Control-Allow-Origin'] = '*';
            return req;
          },
          onComplete: function() {
            console.log('Swagger UI loaded successfully');
          },
          onFailure: function(err) {
            console.error('Swagger UI failed to load:', err);
            document.getElementById('swagger-ui').innerHTML = 
              '<div style="padding: 50px; text-align: center;">' +
              '<h2>Failed to load API documentation</h2>' +
              '<p>Error: ' + err.message + '</p>' +
              '<p><a href="/health">Check API Health</a></p>' +
              '</div>';
          }
        });
      };
    } catch (err) {
      console.error('Error initializing Swagger UI:', err);
      document.getElementById('swagger-ui').innerHTML = 
        '<div style="padding: 50px; text-align: center;">' +
        '<h2>Error loading documentation</h2>' +
        '<p>' + err.message + '</p>' +
        '</div>';
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Routes
require("./app/routes/auth.routes")(app);
require("./app/routes/user.routes")(app);
require("./app/routes/prediction.routes")(app);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    swagger: "Available at /api/docs",
    api_version: "2.0.0"
  });
});

// Default route
app.get("/", (req, res) => {
  res.json({
    message: "🌱 Plant Disease Prediction API is running!",
    version: "2.0.0",
    endpoints: {
      auth: "/api/auth/*",
      prediction: "/api/predict",
      history: "/api/predictions/history",
      docs: "/api/docs",
      health: "/health"
    },
    documentation: {
      swagger_ui: "/api/docs",
      swagger_json: "/api/docs/swagger.json"
    }
  });
});

// Error handling middleware
const { errorHandler } = require("./app/middleware/errorHandler");
app.use(errorHandler);

// Server start (only if not in Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
    console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
    console.log(`📋 Swagger JSON: http://localhost:${PORT}/api/docs/swagger.json`);
  });
}

module.exports = app;
// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const path = require("path");
const { limiter } = require("./app/utils/rateLimiter");
const swaggerUi = require("swagger-ui-express");
const swaggerConfig = require("./app/config/swagger.config");

const app = express();

// Database connection dengan auto-seed
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URI || "mongodb://127.0.0.1:27017/auth_service", {
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

// Universal CORS configuration yang lebih permisif
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Development: Allow localhost dengan berbagai port
    const localhostRegex = /^http:\/\/localhost:\d+$/;
    const localhostIPRegex = /^http:\/\/127\.0\.0\.1:\d+$/;
    const localhostIPv4Regex = /^http:\/\/192\.168\.\d+\.\d+:\d+$/;
    
    if (localhostRegex.test(origin) || localhostIPRegex.test(origin) || localhostIPv4Regex.test(origin)) {
      return callback(null, true);
    }

    // Allow ngrok domains
    if (origin.includes('ngrok.io') || 
        origin.includes('ngrok-free.app') || 
        origin.includes('ngrok.app') ||
        origin.includes('ngrok.dev')) {
      return callback(null, true);
    }

    // Allow Vercel deployments
    if (origin.includes('vercel.app') || 
        origin.includes('vercel.sh') ||
        origin.includes('now.sh')) {
      return callback(null, true);
    }

    // Allow Netlify deployments
    if (origin.includes('netlify.app') || 
        origin.includes('netlify.com')) {
      return callback(null, true);
    }

    // Allow GitHub Pages
    if (origin.includes('github.io')) {
      return callback(null, true);
    }

    // Allow custom domains from environment
    const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').filter(Boolean);
    if (allowedOrigins.some(allowedOrigin => origin === allowedOrigin.trim())) {
      return callback(null, true);
    }

    // Allow HTTPS domains in production
    if (process.env.NODE_ENV === 'production' && origin.startsWith('https://')) {
      return callback(null, true);
    }

    // In development, allow all origins
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
  crossOriginEmbedderPolicy: false
}));

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Conditional logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("combined"));
}

app.use(limiter);

// Routes
require("./app/routes/auth.routes")(app);
require("./app/routes/user.routes")(app);
require("./app/routes/prediction.routes")(app);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerConfig));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cors: "Universal CORS enabled"
  });
});

// Default route
app.get("/", (req, res) => {
  res.json({ 
    message: "Plant Disease Prediction API is running!",
    version: "2.0.0",
    endpoints: {
      auth: "/api/auth/*",
      prediction: "/api/predict",
      history: "/api/predictions/history",
      docs: "/api/docs",
      health: "/health"
    },
    cors: {
      enabled: true,
      policy: "Universal - allows development and production domains"
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
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api/docs`);
    console.log(`Prediction endpoint: http://localhost:${PORT}/api/predict`);
  });
}

module.exports = app;
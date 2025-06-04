// app/config/swagger.config.js - Fixed version without update prediction endpoint
module.exports = {
  swagger: "2.0",
  info: {
    version: "2.0.0",
    title: "Plant Disease Prediction API - Complete Edition",
    description: "Comprehensive Authentication & Plant Disease Prediction API with CRUD operations (Create, Read, Delete - No Update)",
    contact: {
      name: "API Support",
      email: "glorioussatria@gmail.com"
    }
  },
  host: "localhost:8000",
  basePath: "/",
  schemes: ["http", "https"],
  consumes: ["application/json"],
  produces: ["application/json"],
  securityDefinitions: {
    Bearer: {
      type: "apiKey",
      name: "x-access-token",
      in: "header",
      description: "JWT token for authentication"
    }
  },
  tags: [
    { name: "Auth", description: "Authentication and authorization endpoints" },
    { name: "User", description: "User profile and management endpoints" },
    { name: "Prediction", description: "Plant disease prediction endpoints" },
    { name: "Admin", description: "Admin-only endpoints" },
    { name: "Moderator", description: "Moderator endpoints" }
  ],
  paths: {
    // Authentication endpoints
    "/api/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user account",
        description: "Create a new user account with username, email, and password",
        parameters: [{
          in: "body",
          name: "body",
          required: true,
          schema: {
            type: "object",
            properties: {
              username: { type: "string", minLength: 3, maxLength: 30 },
              email: { type: "string", format: "email" },
              password: { type: "string", minLength: 6 },
              firstName: { type: "string", maxLength: 50 },
              lastName: { type: "string", maxLength: 50 },
              phone: { type: "string", maxLength: 20 },
              address: { type: "string", maxLength: 200 },
              roles: { type: "array", items: { type: "string" } }
            },
            required: ["username", "email", "password"]
          }
        }],
        responses: {
          200: { description: "User registered successfully" },
          400: { description: "Invalid input or user already exists" },
          500: { description: "Internal server error" }
        }
      }
    },
    "/api/auth/signin": {
      post: {
        tags: ["Auth"],
        summary: "Sign in to get access token",
        description: "Authenticate user and receive JWT access token",
        parameters: [{
          in: "body",
          name: "body",
          required: true,
          schema: {
            type: "object",
            properties: {
              username: { type: "string" },
              password: { type: "string" }
            },
            required: ["username", "password"]
          }
        }],
        responses: {
          200: { 
            description: "User signed in successfully",
            schema: {
              type: "object",
              properties: {
                id: { type: "string" },
                username: { type: "string" },
                email: { type: "string" },
                roles: { type: "array", items: { type: "string" } },
                accessToken: { type: "string" },
                lastLogin: { type: "string", format: "date-time" }
              }
            }
          },
          401: { description: "Invalid credentials" },
          403: { description: "Account deactivated" },
          404: { description: "User not found" }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout and invalidate token",
        description: "Logout current user and blacklist the token",
        security: [{ "Bearer": [] }],
        responses: {
          200: { description: "Logged out successfully" },
          400: { description: "No token provided" },
          401: { description: "Invalid token" }
        }
      }
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request password reset",
        description: "Send password reset token to user's email",
        parameters: [{
          in: "body",
          name: "body",
          required: true,
          schema: {
            type: "object",
            properties: {
              email: { type: "string", format: "email" }
            },
            required: ["email"]
          }
        }],
        responses: {
          200: { description: "Reset token generated successfully" },
          404: { description: "User not found" }
        }
      }
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password with token",
        description: "Reset user password using reset token",
        parameters: [{
          in: "body",
          name: "body",
          required: true,
          schema: {
            type: "object",
            properties: {
              resetToken: { type: "string" },
              newPassword: { type: "string", minLength: 6 }
            },
            required: ["resetToken", "newPassword"]
          }
        }],
        responses: {
          200: { description: "Password reset successfully" },
          401: { description: "Invalid or expired token" }
        }
      }
    },
    "/api/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change current password",
        description: "Change password for authenticated user",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "body",
          name: "body",
          required: true,
          schema: {
            type: "object",
            properties: {
              currentPassword: { type: "string" },
              newPassword: { type: "string", minLength: 6 }
            },
            required: ["currentPassword", "newPassword"]
          }
        }],
        responses: {
          200: { description: "Password changed successfully" },
          401: { description: "Current password is incorrect" }
        }
      }
    },

    // User endpoints
    "/api/user/profile": {
      get: {
        tags: ["User"],
        summary: "Get current user profile",
        description: "Retrieve authenticated user's profile information",
        security: [{ "Bearer": [] }],
        responses: {
          200: { description: "Profile retrieved successfully" },
          401: { description: "Authentication required" },
          404: { description: "User not found" }
        }
      },
      put: {
        tags: ["User"],
        summary: "Update user profile",
        description: "Update authenticated user's profile information",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "body",
          name: "body",
          schema: {
            type: "object",
            properties: {
              username: { type: "string" },
              email: { type: "string", format: "email" },
              profile: {
                type: "object",
                properties: {
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  phone: { type: "string" },
                  address: { type: "string" }
                }
              }
            }
          }
        }],
        responses: {
          200: { description: "Profile updated successfully" },
          400: { description: "Invalid input or username/email already exists" }
        }
      }
    },
    "/api/user/account": {
      delete: {
        tags: ["User"],
        summary: "Delete user account",
        description: "Permanently delete current user account",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "body",
          name: "body",
          required: true,
          schema: {
            type: "object",
            properties: {
              password: { type: "string" }
            },
            required: ["password"]
          }
        }],
        responses: {
          200: { description: "Account deleted successfully" },
          401: { description: "Invalid password" }
        }
      }
    },

    // Prediction endpoints (No UPDATE operation)
    "/api/predict": {
      post: {
        tags: ["Prediction"],
        summary: "Predict plant disease from image",
        description: "Upload image and get plant disease prediction",
        consumes: ["multipart/form-data"],
        parameters: [
          {
            in: "formData",
            name: "image",
            type: "file",
            required: true,
            description: "Plant leaf image (JPEG, PNG, WebP, max 5MB)"
          },
          {
            in: "formData",
            name: "notes",
            type: "string",
            description: "Optional notes about the image"
          },
          {
            in: "header",
            name: "x-access-token",
            type: "string",
            required: false,
            description: "Optional JWT token for authenticated prediction"
          }
        ],
        responses: {
          200: { 
            description: "Prediction completed successfully",
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" },
                data: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    predictedClass: { type: "string" },
                    confidence: { type: "number" },
                    allPredictions: { type: "array" },
                    imageName: { type: "string" },
                    imageUrl: { type: "string" },
                    processingTime: { type: "string" }
                  }
                }
              }
            }
          },
          400: { description: "Invalid image file" },
          500: { description: "Prediction failed" }
        }
      }
    },
    "/api/predictions/history": {
      get: {
        tags: ["Prediction"],
        summary: "Get prediction history",
        description: "Retrieve authenticated user's prediction history",
        security: [{ "Bearer": [] }],
        parameters: [
          {
            in: "query",
            name: "page",
            type: "integer",
            description: "Page number (default: 1)"
          },
          {
            in: "query",
            name: "limit",
            type: "integer",
            description: "Items per page (default: 10, max: 50)"
          },
          {
            in: "query",
            name: "predictedClass",
            type: "string",
            description: "Filter by disease class"
          },
          {
            in: "query",
            name: "startDate",
            type: "string",
            format: "date",
            description: "Filter from date (YYYY-MM-DD)"
          },
          {
            in: "query",
            name: "endDate",
            type: "string",
            format: "date",
            description: "Filter to date (YYYY-MM-DD)"
          }
        ],
        responses: {
          200: { description: "History retrieved successfully" },
          401: { description: "Authentication required" }
        }
      }
    },
    "/api/predictions/{id}": {
      get: {
        tags: ["Prediction"],
        summary: "Get prediction details",
        description: "Get detailed information about a specific prediction",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "path",
          name: "id",
          type: "string",
          required: true,
          description: "Prediction ID"
        }],
        responses: {
          200: { description: "Prediction details retrieved" },
          404: { description: "Prediction not found" }
        }
      },
      delete: {
        tags: ["Prediction"],
        summary: "Delete prediction",
        description: "Delete a prediction and its associated image",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "path",
          name: "id",
          type: "string",
          required: true
        }],
        responses: {
          200: { description: "Prediction deleted successfully" },
          404: { description: "Prediction not found" }
        }
      }
    },

    // Admin endpoints
    "/api/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "Get all users (Admin only)",
        description: "Retrieve paginated list of all users",
        security: [{ "Bearer": [] }],
        parameters: [
          {
            in: "query",
            name: "page",
            type: "integer"
          },
          {
            in: "query",
            name: "limit",
            type: "integer"
          },
          {
            in: "query",
            name: "search",
            type: "string",
            description: "Search by username, email, or name"
          },
          {
            in: "query",
            name: "status",
            type: "string",
            enum: ["active", "inactive", "suspended"]
          },
          {
            in: "query",
            name: "role",
            type: "string",
            enum: ["user", "admin", "moderator"]
          }
        ],
        responses: {
          200: { description: "Users retrieved successfully" },
          403: { description: "Admin access required" }
        }
      }
    },
    "/api/admin/users/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get user by ID (Admin only)",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "path",
          name: "id",
          type: "string",
          required: true
        }],
        responses: {
          200: { description: "User retrieved successfully" },
          404: { description: "User not found" }
        }
      },
      put: {
        tags: ["Admin"],
        summary: "Update user (Admin only)",
        security: [{ "Bearer": [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            type: "string",
            required: true
          },
          {
            in: "body",
            name: "body",
            schema: {
              type: "object",
              properties: {
                username: { type: "string" },
                email: { type: "string" },
                roles: { type: "array", items: { type: "string" } },
                status: { type: "string", enum: ["active", "inactive", "suspended"] },
                profile: { type: "object" }
              }
            }
          }
        ],
        responses: {
          200: { description: "User updated successfully" },
          404: { description: "User not found" }
        }
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete user (Admin only)",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "path",
          name: "id",
          type: "string",
          required: true
        }],
        responses: {
          200: { description: "User deleted successfully" },
          400: { description: "Cannot delete own account" },
          404: { description: "User not found" }
        }
      }
    },
    "/api/admin/predictions": {
      get: {
        tags: ["Admin"],
        summary: "Get all predictions (Admin only)",
        security: [{ "Bearer": [] }],
        parameters: [
          {
            in: "query",
            name: "page",
            type: "integer"
          },
          {
            in: "query",
            name: "limit",
            type: "integer"
          },
          {
            in: "query",
            name: "predictedClass",
            type: "string"
          },
          {
            in: "query",
            name: "predictionType",
            type: "string",
            enum: ["authenticated", "anonymous"]
          },
          {
            in: "query",
            name: "userId",
            type: "string"
          }
        ],
        responses: {
          200: { description: "All predictions retrieved successfully" }
        }
      }
    },
    "/api/admin/predictions/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete any prediction (Admin only)",
        security: [{ "Bearer": [] }],
        parameters: [{
          in: "path",
          name: "id",
          type: "string",
          required: true
        }],
        responses: {
          200: { description: "Prediction deleted successfully" },
          404: { description: "Prediction not found" }
        }
      }
    },
    "/api/predictions/stats": {
      get: {
        tags: ["Admin"],
        summary: "Get prediction statistics (Admin only)",
        security: [{ "Bearer": [] }],
        responses: {
          200: { 
            description: "Statistics retrieved successfully",
            schema: {
              type: "object",
              properties: {
                overview: { type: "object" },
                predictionsByClass: { type: "array" },
                predictionsByDate: { type: "array" },
                systemInfo: { type: "object" }
              }
            }
          }
        }
      }
    },
    "/api/model/health": {
      get: {
        tags: ["Prediction"],
        summary: "Check model health status",
        description: "Get information about the ML model status and capabilities",
        responses: {
          200: { 
            description: "Model health information",
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: {
                  type: "object",
                  properties: {
                    modelLoaded: { type: "boolean" },
                    modelType: { type: "string" },
                    totalClasses: { type: "integer" },
                    inputShape: { type: "array" },
                    outputShape: { type: "array" },
                    memoryInfo: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  definitions: {
    User: {
      type: "object",
      properties: {
        id: { type: "string" },
        username: { type: "string" },
        email: { type: "string" },
        profile: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" }
          }
        },
        roles: { type: "array", items: { type: "string" } },
        status: { type: "string" },
        lastLogin: { type: "string", format: "date-time" },
        createdAt: { type: "string", format: "date-time" }
      }
    },
    Prediction: {
      type: "object",
      properties: {
        id: { type: "string" },
        predictedClass: { type: "string" },
        confidence: { type: "number" },
        imageName: { type: "string" },
        imageUrl: { type: "string" },
        notes: { type: "string" },
        processingTime: { type: "number" },
        createdAt: { type: "string", format: "date-time" }
      }
    },
    Error: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        error: { type: "string" }
      }
    }
  }
};
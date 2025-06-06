// app/config/swagger.config.js - Updated and improved
class SwaggerConfig {
  constructor() {
    this.baseConfig = {
      swagger: "2.0",
      info: {
        version: "2.0.0",
        title: "Plant Disease Prediction API",
        description: "Comprehensive Authentication & Plant Disease Prediction API with CRUD operations",
        contact: {
          name: "API Support",
          email: "glorioussatria@gmail.com"
        },
        license: {
          name: "ISC"
        }
      },
      // Default values - will be overridden dynamically
      host: "localhost:8000",
      schemes: ["http"],
      basePath: "/",
      consumes: ["application/json", "multipart/form-data"],
      produces: ["application/json"],
      
      securityDefinitions: {
        Bearer: {
          type: "apiKey",
          name: "x-access-token",
          in: "header",
          description: "JWT token for authentication. Format: 'your-jwt-token'"
        }
      },
      
      tags: [
        { name: "Health", description: "Health check endpoints" },
        { name: "Auth", description: "Authentication and authorization endpoints" },
        { name: "User", description: "User profile and management endpoints" },
        { name: "Prediction", description: "Plant disease prediction endpoints" },
        { name: "Admin", description: "Admin-only endpoints" }
      ]
    };
  }

  getSwaggerDoc(req) {
  // RAILWAY FIX: Force HTTPS and correct host detection
  const isProduction = process.env.NODE_ENV === 'production';
  const host = req.get('host');
  
  // Railway always uses HTTPS in production
  const protocol = isProduction ? 'https' : (req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http');
  
  // For Railway, ensure we use the correct scheme
  const schemes = isProduction ? ['https'] : [protocol];
  
  return {
    ...this.baseConfig,
    host: host,
    schemes: schemes,
    paths: this.getPaths(),
    definitions: this.getDefinitions()
  };
  }

  getPaths() {
    return {
      // Health endpoints
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Check if the API is running",
          responses: {
            200: { 
              description: "API is healthy",
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "OK" },
                  timestamp: { type: "string", format: "date-time" },
                  environment: { type: "string", example: "development" },
                  database: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                      connection: { type: "string" }
                    }
                  }
                }
              }
            },
            503: { description: "Service unavailable" }
          }
        }
      },

      "/health/database": {
        get: {
          tags: ["Health"],
          summary: "Database health check",
          description: "Check database connection status and statistics",
          responses: {
            200: { description: "Database is healthy" },
            503: { description: "Database is not connected" },
            500: { description: "Database health check failed" }
          }
        }
      },

      "/api/model/health": {
        get: {
          tags: ["Prediction"],
          summary: "Check ML model health",
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
                      outputShape: { type: "array" }
                    }
                  }
                }
              }
            }
          }
        }
      },

      // Authentication endpoints
      "/api/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user",
          description: "Create a new user account",
          parameters: [{
            in: "body",
            name: "body",
            required: true,
            schema: {
              type: "object",
              required: ["username", "email", "password"],
              properties: {
                username: { 
                  type: "string", 
                  minLength: 3, 
                  maxLength: 30,
                  example: "john_doe"
                },
                email: { 
                  type: "string", 
                  format: "email",
                  example: "john@example.com"
                },
                password: { 
                  type: "string", 
                  minLength: 6,
                  example: "password123"
                },
                firstName: { type: "string", example: "John" },
                lastName: { type: "string", example: "Doe" }
              }
            }
          }],
          responses: {
            200: { 
              description: "User registered successfully",
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "User was registered successfully!" },
                  userId: { type: "string" }
                }
              }
            },
            400: { 
              description: "Bad request",
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Username already exists!" }
                }
              }
            }
          }
        }
      },

      "/api/auth/signin": {
        post: {
          tags: ["Auth"],
          summary: "Sign in",
          description: "Authenticate user and get access token",
          parameters: [{
            in: "body",
            name: "body",
            required: true,
            schema: {
              type: "object",
              required: ["username", "password"],
              properties: {
                username: { type: "string", example: "john_doe" },
                password: { type: "string", example: "password123" }
              }
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
                  accessToken: { type: "string" }
                }
              }
            },
            401: { description: "Invalid credentials" },
            404: { description: "User not found" }
          }
        }
      },

      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout",
          description: "Logout current user and invalidate token",
          security: [{ "Bearer": [] }],
          responses: {
            200: { description: "Logged out successfully" },
            401: { description: "Invalid token" }
          }
        }
      },

      // Prediction endpoints
      "/api/predict": {
        post: {
          tags: ["Prediction"],
          summary: "Predict plant disease",
          description: "Upload an image and get plant disease prediction",
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
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      predictedClass: { type: "string", example: "Tomato__healthy" },
                      confidence: { type: "number", example: 95.5 },
                      allPredictions: { 
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            class: { type: "string" },
                            confidence: { type: "number" }
                          }
                        }
                      },
                      imageName: { type: "string" },
                      processingTime: { type: "string", example: "1500ms" }
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
          description: "Get authenticated user's prediction history",
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

      // User endpoints
      "/api/user/profile": {
        get: {
          tags: ["User"],
          summary: "Get user profile",
          security: [{ "Bearer": [] }],
          responses: {
            200: { description: "Profile retrieved successfully" },
            401: { description: "Authentication required" }
          }
        },
        put: {
          tags: ["User"],
          summary: "Update user profile",
          security: [{ "Bearer": [] }],
          parameters: [{
            in: "body",
            name: "body",
            schema: {
              type: "object",
              properties: {
                username: { type: "string" },
                email: { type: "string" },
                profile: {
                  type: "object",
                  properties: {
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    phone: { type: "string" }
                  }
                }
              }
            }
          }],
          responses: {
            200: { description: "Profile updated successfully" },
            400: { description: "Invalid input" }
          }
        }
      },

      // Admin endpoints
      "/api/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "Get all users (Admin only)",
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
            }
          ],
          responses: {
            200: { description: "Users retrieved successfully" },
            403: { description: "Admin access required" }
          }
        }
      },

      "/api/admin/predictions": {
        get: {
          tags: ["Admin"],
          summary: "Get all predictions (Admin only)",
          security: [{ "Bearer": [] }],
          responses: {
            200: { description: "All predictions retrieved successfully" },
            403: { description: "Admin access required" }
          }
        }
      }
    };
  }

  getDefinitions() {
    return {
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
              phone: { type: "string" }
            }
          },
          roles: { type: "array", items: { type: "string" } },
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
          processingTime: { type: "number" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          error: { type: "string" }
        }
      }
    };
  }

  generateSwaggerHTML(swaggerJsonUrl) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="SwaggerUI" />
  <title>Plant Disease API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      font-family: Arial, sans-serif; 
      background-color: #f7f7f7;
    }
    .swagger-ui .topbar { 
      display: none; 
    }
    .swagger-ui .info { 
      margin: 20px 0; 
    }
    .swagger-ui .info .title {
      color: #3b4151;
      font-size: 36px;
      margin-bottom: 10px;
    }
    .loading { 
      text-align: center; 
      padding: 50px; 
      font-size: 18px; 
      color: #666;
    }
    .error-container {
      padding: 50px;
      text-align: center;
      background-color: #fff;
      margin: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .error-container h2 {
      color: #e74c3c;
      margin-bottom: 15px;
    }
    .error-container p {
      color: #666;
      margin: 10px 0;
    }
    .error-container a {
      color: #3498db;
      text-decoration: none;
      padding: 8px 16px;
      background: #ecf0f1;
      border-radius: 4px;
      display: inline-block;
      margin: 5px;
    }
    .error-container a:hover {
      background: #bdc3c7;
    }
    .swagger-ui .wrapper {
      padding: 0 20px;
    }
  </style>
</head>
<body>
  <div id="swagger-ui">
    <div class="loading">
      <h2>🌱 Loading Plant Disease API Documentation...</h2>
      <p>Please wait while we load the API documentation.</p>
    </div>
  </div>
  
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    try {
      console.log('Initializing Swagger UI...');
      console.log('Swagger JSON URL:', '${swaggerJsonUrl}');
      
      window.onload = function() {
        try {
          const ui = SwaggerUIBundle({
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
            tryItOutEnabled: true,
            supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
            validatorUrl: null,
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 1,
            docExpansion: 'list',
            requestInterceptor: function(req) {
              req.headers['Access-Control-Allow-Origin'] = '*';
              return req;
            },
            responseInterceptor: function(response) {
              console.log('API Response:', response);
              return response;
            },
            onComplete: function() {
              console.log('✅ Swagger UI loaded successfully');
              const loadingEl = document.querySelector('.loading');
              if (loadingEl) {
                loadingEl.style.display = 'none';
              }
            },
            onFailure: function(err) {
              console.error('❌ Swagger UI failed to load:', err);
              document.getElementById('swagger-ui').innerHTML = 
                '<div class="error-container">' +
                '<h2>🚫 Failed to Load API Documentation</h2>' +
                '<p><strong>Error:</strong> ' + (err.message || 'Unknown error occurred') + '</p>' +
                '<p>Please try the following:</p>' +
                '<a href="/health">Check API Health</a>' +
                '<a href="/api/docs/swagger.json">View Raw JSON</a>' +
                '<a href="javascript:location.reload()">Reload Page</a>' +
                '</div>';
            }
          });
          
          window.ui = ui;
          
        } catch (initError) {
          console.error('Initialization error:', initError);
          document.getElementById('swagger-ui').innerHTML = 
            '<div class="error-container">' +
            '<h2>⚠️ Initialization Error</h2>' +
            '<p><strong>Error:</strong> ' + initError.message + '</p>' +
            '<p>Your browser might not support this version of Swagger UI.</p>' +
            '<a href="/health">Check API Health</a>' +
            '<a href="/api/docs/swagger.json">View Raw JSON</a>' +
            '</div>';
        }
      };
      
    } catch (scriptError) {
      console.error('Script error:', scriptError);
      document.getElementById('swagger-ui').innerHTML = 
        '<div class="error-container">' +
        '<h2>🔧 Script Loading Error</h2>' +
        '<p><strong>Error:</strong> ' + scriptError.message + '</p>' +
        '<p>Please check your internet connection and try again.</p>' +
        '<a href="javascript:location.reload()">Reload Page</a>' +
        '</div>';
    }
  </script>
</body>
</html>`;
  }
}

// Create singleton instance
const swaggerConfig = new SwaggerConfig();

module.exports = swaggerConfig;
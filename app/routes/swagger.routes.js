// app/routes/swagger.routes.js - Railway Compatible Version
const swaggerConfig = require("../config/swagger.config");

module.exports = function(app) {
  // Enhanced CORS headers for Railway
  app.use('/api/docs*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-access-token");
    res.header("Access-Control-Max-Age", "86400");
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Serve Swagger JSON with enhanced headers
  app.get('/api/docs/swagger.json', (req, res) => {
    try {
      const swaggerDoc = swaggerConfig.getSwaggerDoc(req);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Railway fix: Add CORS headers explicitly
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      res.json(swaggerDoc);
    } catch (error) {
      console.error('Error generating swagger JSON:', error);
      res.status(500).json({
        error: 'Failed to generate swagger documentation',
        message: error.message
      });
    }
  });

  // Enhanced Swagger UI HTML with Railway fixes
  app.get('/api/docs', (req, res) => {
    try {
      const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const swaggerJsonUrl = `${protocol}://${req.get('host')}/api/docs/swagger.json`;
      
      const html = generateRailwayCompatibleSwaggerHTML(swaggerJsonUrl);
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      res.send(html);
    } catch (error) {
      console.error('Error serving swagger UI:', error);
      res.status(500).send(`
        <div style="padding: 50px; text-align: center;">
          <h2>Error Loading Swagger UI</h2>
          <p>Error: ${error.message}</p>
          <a href="/health">Check API Health</a>
        </div>
      `);
    }
  });

  // Swagger redirect (optional - redirect from /docs to /api/docs)
  app.get('/docs', (req, res) => {
    res.redirect('/api/docs');
  });
};

// Railway-compatible Swagger HTML generator
function generateRailwayCompatibleSwaggerHTML(swaggerJsonUrl) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Plant Disease API Documentation" />
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
              // Railway fix: Ensure HTTPS for production
              if (window.location.protocol === 'https:' && req.url.startsWith('http:')) {
                req.url = req.url.replace('http:', 'https:');
              }
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
                '<p>This might be a CORS issue. Please try:</p>' +
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
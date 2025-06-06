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

  // Enhanced Swagger UI HTML with nonce support
  app.get('/api/docs', (req, res) => {
    try {
      const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const swaggerJsonUrl = `${protocol}://${req.get('host')}/api/docs/swagger.json`;
      const nonce = res.locals.nonce;
      
      if (!nonce) {
        console.error('❌ No nonce available for Swagger UI');
        return res.status(500).send(`
          <div style="padding: 50px; text-align: center;">
            <h2>Security Error</h2>
            <p>CSP nonce not generated. Please check server configuration.</p>
            <a href="/health">Check API Health</a>
          </div>
        `);
      }
      
      const html = generateNonceSwaggerHTML(swaggerJsonUrl, nonce);
      
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

  // Debug endpoint to check nonce generation
  app.get('/api/docs/debug', (req, res) => {
    res.json({
      success: true,
      message: 'Swagger debug information',
      data: {
        nonce: res.locals.nonce || 'NOT_GENERATED',
        nonceLength: res.locals.nonce ? res.locals.nonce.length : 0,
        environment: process.env.NODE_ENV,
        protocol: req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http',
        host: req.get('host'),
        swaggerJsonUrl: `${req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http'}://${req.get('host')}/api/docs/swagger.json`
      },
      timestamp: new Date().toISOString()
    });
  });

  // Swagger redirect (optional - redirect from /docs to /api/docs)
  app.get('/docs', (req, res) => {
    res.redirect('/api/docs');
  });
};

// Nonce-based Swagger HTML generator
function generateNonceSwaggerHTML(swaggerJsonUrl, nonce) {
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
    .security-info {
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(52, 152, 219, 0.1);
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      color: #2c3e50;
      border: 1px solid rgba(52, 152, 219, 0.3);
    }
  </style>
</head>
<body>
  <div class="security-info">
    🛡️ CSP: Nonce-protected
  </div>
  
  <div id="swagger-ui">
    <div class="loading">
      <h2>🌱 Loading Plant Disease API Documentation...</h2>
      <p>Please wait while we load the API documentation.</p>
      <p><small>Security: CSP with nonce ${nonce.substring(0, 8)}...</small></p>
    </div>
  </div>
  
  <!-- External Swagger UI Bundle -->
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" crossorigin></script>
  
  <!-- Nonce-protected initialization script -->
  <script nonce="${nonce}">
    console.log('🛡️ Swagger UI initializing with CSP nonce protection');
    console.log('🔍 Swagger JSON URL:', '${swaggerJsonUrl}');
    
    // Ensure DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeSwagger);
    } else {
      initializeSwagger();
    }
    
    function initializeSwagger() {
      try {
        // Check if SwaggerUIBundle is available
        if (typeof SwaggerUIBundle === 'undefined') {
          throw new Error('SwaggerUIBundle not loaded. Please check your internet connection.');
        }
        
        console.log('✅ SwaggerUIBundle loaded successfully');
        
        // Initialize Swagger UI
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
              console.log('🔄 Request URL corrected to HTTPS:', req.url);
            }
            
            // Add CORS headers
            req.headers['Access-Control-Allow-Origin'] = '*';
            
            console.log('📤 API Request:', req.method, req.url);
            return req;
          },
          responseInterceptor: function(response) {
            console.log('📥 API Response:', response.status, response.url);
            return response;
          },
          onComplete: function() {
            console.log('✅ Swagger UI loaded successfully');
            
            // Hide loading indicator
            const loadingEl = document.querySelector('.loading');
            if (loadingEl) {
              loadingEl.style.display = 'none';
            }
            
            // Add success indicator
            const securityInfo = document.querySelector('.security-info');
            if (securityInfo) {
              securityInfo.innerHTML = '🛡️ CSP: Protected ✅ Loaded';
              securityInfo.style.background = 'rgba(39, 174, 96, 0.1)';
              securityInfo.style.borderColor = 'rgba(39, 174, 96, 0.3)';
            }
          },
          onFailure: function(err) {
            console.error('❌ Swagger UI failed to load:', err);
            
            let errorMessage = err.message || 'Unknown error occurred';
            let troubleshooting = [];
            
            // Analyze error type
            if (errorMessage.includes('fetch')) {
              troubleshooting = [
                'Check if API server is running',
                'Verify CORS configuration',
                'Check network connectivity'
              ];
            } else if (errorMessage.includes('JSON')) {
              troubleshooting = [
                'Check Swagger JSON endpoint: /api/docs/swagger.json',
                'Verify API server is returning valid JSON',
                'Check server logs for JSON parsing errors'
              ];
            } else {
              troubleshooting = [
                'Try refreshing the page',
                'Check browser console for detailed errors',
                'Verify API server health: /health'
              ];
            }
            
            document.getElementById('swagger-ui').innerHTML = 
              '<div class="error-container">' +
              '<h2>🚫 Failed to Load API Documentation</h2>' +
              '<p><strong>Error:</strong> ' + errorMessage + '</p>' +
              '<p><strong>Troubleshooting steps:</strong></p>' +
              '<ul style="text-align: left; display: inline-block;">' +
              troubleshooting.map(step => '<li>' + step + '</li>').join('') +
              '</ul>' +
              '<div style="margin-top: 20px;">' +
              '<a href="/health">Check API Health</a>' +
              '<a href="/api/docs/swagger.json">View Raw JSON</a>' +
              '<a href="/api/docs/debug">Debug Info</a>' +
              '<a href="javascript:location.reload()">Reload Page</a>' +
              '</div>' +
              '</div>';
              
            // Update security indicator
            const securityInfo = document.querySelector('.security-info');
            if (securityInfo) {
              securityInfo.innerHTML = '🛡️ CSP: Protected ❌ Failed';
              securityInfo.style.background = 'rgba(231, 76, 60, 0.1)';
              securityInfo.style.borderColor = 'rgba(231, 76, 60, 0.3)';
            }
          }
        });
        
        // Store UI instance globally for debugging
        window.ui = ui;
        window.swaggerDebug = {
          nonce: '${nonce}',
          url: '${swaggerJsonUrl}',
          timestamp: new Date().toISOString()
        };
        
        console.log('🔧 Swagger debug info available in window.swaggerDebug');
        
      } catch (initError) {
        console.error('💥 Initialization error:', initError);
        
        document.getElementById('swagger-ui').innerHTML = 
          '<div class="error-container">' +
          '<h2>⚠️ Initialization Error</h2>' +
          '<p><strong>Error:</strong> ' + initError.message + '</p>' +
          '<p>This might be due to:</p>' +
          '<ul style="text-align: left; display: inline-block;">' +
          '<li>Browser compatibility issues</li>' +
          '<li>Missing JavaScript dependencies</li>' +
          '<li>Content Security Policy restrictions</li>' +
          '<li>Network connectivity problems</li>' +
          '</ul>' +
          '<div style="margin-top: 20px;">' +
          '<a href="/health">Check API Health</a>' +
          '<a href="/api/docs/swagger.json">View Raw JSON</a>' +
          '<a href="/api/docs/debug">Debug Info</a>' +
          '</div>' +
          '</div>';
          
        // Update security indicator
        const securityInfo = document.querySelector('.security-info');
        if (securityInfo) {
          securityInfo.innerHTML = '🛡️ CSP: Protected ⚠️ Init Error';
          securityInfo.style.background = 'rgba(243, 156, 18, 0.1)';
          securityInfo.style.borderColor = 'rgba(243, 156, 18, 0.3)';
        }
      }
    }
  </script>
</body>
</html>`;
}
// app/routes/swagger.routes.js
const swaggerConfig = require("../config/swagger.config");

module.exports = function(app) {
  // Set CORS headers for swagger routes
  app.use('/api/docs*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  // Serve Swagger JSON
  app.get('/api/docs/swagger.json', (req, res) => {
    try {
      const swaggerDoc = swaggerConfig.getSwaggerDoc(req);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(swaggerDoc);
    } catch (error) {
      console.error('Error generating swagger JSON:', error);
      res.status(500).json({
        error: 'Failed to generate swagger documentation',
        message: error.message
      });
    }
  });

  // Serve Swagger UI HTML
  app.get('/api/docs', (req, res) => {
    try {
      const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const swaggerJsonUrl = `${protocol}://${req.get('host')}/api/docs/swagger.json`;
      
      const html = swaggerConfig.generateSwaggerHTML(swaggerJsonUrl);
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
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
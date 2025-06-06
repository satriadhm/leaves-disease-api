// app/routes/troubleshoot.routes.js
const TroubleshootController = require("../controllers/troubleshoot.controller");
const { authJwt } = require("../middleware");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  // Public troubleshooting endpoints (for initial diagnosis)
  
  // Quick connection test - minimal, fast check
  app.get("/api/troubleshoot/connection", TroubleshootController.quickConnectionTest);
  
  // Full diagnostics - comprehensive check
  app.get("/api/troubleshoot/full", TroubleshootController.runDiagnostics);
  
  // Troubleshooting web interface
  app.get("/troubleshoot", (req, res) => {
    const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${req.get('host')}`;
    
    const html = generateTroubleshootHTML(baseUrl);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // Admin-only endpoints (more detailed diagnostics)
  
  // Advanced diagnostics with sensitive information
  app.get(
    "/api/admin/troubleshoot/advanced",
    [authJwt.verifyToken, authJwt.isAdmin],
    TroubleshootController.runDiagnostics
  );

  // Database health with detailed information
  app.get(
    "/api/admin/troubleshoot/database",
    [authJwt.verifyToken, authJwt.isAdmin],
    async (req, res) => {
      try {
        const controller = new (require("../controllers/troubleshoot.controller"))();
        const dbTest = await controller.testDatabaseConnection();
        const mongoCheck = await controller.checkMongoDB();
        
        res.json({
          success: dbTest.connected,
          message: dbTest.connected ? 'Database diagnostics complete' : 'Database issues detected',
          data: {
            connection: dbTest,
            mongodb: mongoCheck,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Advanced diagnostics failed',
          error: error.message
        });
      }
    }
  );
};

// Generate HTML for troubleshooting interface
function generateTroubleshootHTML(baseUrl) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Troubleshooting - Plant Disease API</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .content {
            padding: 40px;
        }
        
        .test-section {
            margin-bottom: 40px;
            padding: 25px;
            border: 2px solid #e1e8ed;
            border-radius: 8px;
            transition: all 0.3s ease;
        }
        
        .test-section:hover {
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }
        
        .test-section h2 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.5rem;
        }
        
        .test-section p {
            color: #666;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        
        .test-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-right: 10px;
            margin-bottom: 10px;
        }
        
        .test-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        .test-button:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .results {
            margin-top: 20px;
            padding: 20px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
            line-height: 1.6;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .results.success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        
        .results.error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        
        .results.info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-ok { background: #28a745; }
        .status-warning { background: #ffc107; }
        .status-error { background: #dc3545; }
        .status-unknown { background: #6c757d; }
        
        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        
        .info-box h3 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .info-box ul {
            padding-left: 20px;
        }
        
        .info-box li {
            margin-bottom: 5px;
            color: #666;
        }
        
        .endpoint-list {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin-top: 20px;
        }
        
        .endpoint-list h3 {
            margin-bottom: 15px;
            color: #2c3e50;
        }
        
        .endpoint {
            background: white;
            padding: 10px 15px;
            margin-bottom: 10px;
            border-radius: 4px;
            border-left: 3px solid #667eea;
            font-family: 'Courier New', monospace;
        }
        
        .endpoint .method {
            color: #667eea;
            font-weight: bold;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔧 Database Troubleshooting</h1>
            <p>Diagnose and fix database connection issues</p>
        </div>
        
        <div class="content">
            <div class="test-section">
                <h2>🚀 Quick Connection Test</h2>
                <p>Fast check to verify if the database is accessible. This tests basic connectivity and performs a simple ping.</p>
                <button class="test-button" onclick="runQuickTest()">Run Quick Test</button>
                <div id="quick-results"></div>
            </div>
            
            <div class="test-section">
                <h2>🔍 Full Diagnostics</h2>
                <p>Comprehensive analysis of environment variables, connection string format, database health, and MongoDB-specific checks.</p>
                <button class="test-button" onclick="runFullDiagnostics()">Run Full Diagnostics</button>
                <div id="full-results"></div>
            </div>
            
            <div class="info-box">
                <h3>📚 Common Issues & Solutions</h3>
                <ul>
                    <li><strong>Authentication Failed:</strong> Check username/password in MongoDB Atlas Database Access</li>
                    <li><strong>IP Whitelist:</strong> Ensure 0.0.0.0/0 is added in Network Access</li>
                    <li><strong>Connection Timeout:</strong> Verify cluster is running and not paused</li>
                    <li><strong>Invalid Connection String:</strong> Use mongodb+srv:// format for Atlas</li>
                    <li><strong>Missing Environment Variables:</strong> Set MONGODB_URI in Vercel environment variables</li>
                </ul>
            </div>
            
            <div class="endpoint-list">
                <h3>🔗 Available Troubleshooting Endpoints</h3>
                <div class="endpoint">
                    <span class="method">GET</span> /api/troubleshoot/connection - Quick connection test
                </div>
                <div class="endpoint">
                    <span class="method">GET</span> /api/troubleshoot/full - Complete diagnostics
                </div>
                <div class="endpoint">
                    <span class="method">GET</span> /health/database - Database health check
                </div>
                <div class="endpoint">
                    <span class="method">GET</span> /health - General health check
                </div>
            </div>
        </div>
    </div>

    <script>
        async function runQuickTest() {
            const button = document.querySelector('button[onclick="runQuickTest()"]');
            const resultsDiv = document.getElementById('quick-results');
            
            button.disabled = true;
            button.innerHTML = '<div class="loading"></div>Running Test...';
            
            try {
                const response = await fetch('${baseUrl}/api/troubleshoot/connection');
                const data = await response.json();
                
                const className = data.success ? 'success' : 'error';
                const status = data.success ? 'OK' : 'FAILED';
                
                let output = \`Status: \${status}\\n\`;
                output += \`Message: \${data.message}\\n\\n\`;
                
                if (data.data) {
                    output += \`Connection Details:\\n\`;
                    output += \`- Database: \${data.data.database || 'Unknown'}\\n\`;
                    output += \`- Host: \${data.data.host || 'Unknown'}\\n\`;
                    output += \`- Connection Time: \${data.data.connectionTime || data.data.pingTime || 'N/A'}\\n\`;
                    output += \`- Ready State: \${data.data.readyState || 'Unknown'}\\n\`;
                    
                    if (data.data.collections) {
                        output += \`\\nCollections:\\n\`;
                        Object.entries(data.data.collections).forEach(([name, info]) => {
                            output += \`- \${name}: \${info.count || info.error || 'Unknown'} documents\\n\`;
                        });
                    }
                }
                
                if (data.recommendations) {
                    output += \`\\nRecommendations:\\n\`;
                    data.recommendations.forEach((rec, i) => {
                        output += \`\${i + 1}. \${rec}\\n\`;
                    });
                }
                
                if (data.analysis) {
                    output += \`\\nError Analysis:\\n\`;
                    output += \`- Type: \${data.analysis.type}\\n\`;
                    output += \`- Category: \${data.analysis.category}\\n\`;
                    if (data.analysis.recommendations) {
                        output += \`- Suggestions:\\n\`;
                        data.analysis.recommendations.forEach(rec => {
                            output += \`  • \${rec}\\n\`;
                        });
                    }
                }
                
                resultsDiv.innerHTML = \`<div class="results \${className}">\${output}</div>\`;
                
            } catch (error) {
                resultsDiv.innerHTML = \`<div class="results error">Error: \${error.message}</div>\`;
            }
            
            button.disabled = false;
            button.innerHTML = 'Run Quick Test';
        }

        async function runFullDiagnostics() {
            const button = document.querySelector('button[onclick="runFullDiagnostics()"]');
            const resultsDiv = document.getElementById('full-results');
            
            button.disabled = true;
            button.innerHTML = '<div class="loading"></div>Running Diagnostics...';
            
            try {
                const response = await fetch('${baseUrl}/api/troubleshoot/full');
                const data = await response.json();
                
                const className = data.success ? 'success' : 'error';
                const status = data.success ? 'ALL CHECKS PASSED' : 'ISSUES DETECTED';
                
                let output = \`Status: \${status}\\n\`;
                output += \`Timestamp: \${data.data.timestamp}\\n\`;
                output += \`Environment: \${data.data.environment}\\n\`;
                output += \`Platform: \${data.data.platform}\\n\\n\`;
                
                const diagnostics = data.data.diagnostics;
                
                // Environment Check
                output += \`🔧 ENVIRONMENT VARIABLES\\n\`;
                output += \`Status: \${diagnostics.environment.status.toUpperCase()}\\n\`;
                if (diagnostics.environment.issues.length > 0) {
                    output += \`Issues:\\n\`;
                    diagnostics.environment.issues.forEach(issue => {
                        output += \`- \${issue}\\n\`;
                    });
                }
                output += \`\\n\`;
                
                // Connection String Check
                output += \`🔗 CONNECTION STRING\\n\`;
                output += \`Status: \${diagnostics.connectionString.status.toUpperCase()}\\n\`;
                output += \`Masked URI: \${diagnostics.connectionString.masked}\\n\`;
                if (diagnostics.connectionString.issues.length > 0) {
                    output += \`Issues:\\n\`;
                    diagnostics.connectionString.issues.forEach(issue => {
                        output += \`- \${issue}\\n\`;
                    });
                }
                output += \`\\n\`;
                
                // Database Connection Check
                output += \`💾 DATABASE CONNECTION\\n\`;
                output += \`Connected: \${diagnostics.database.connected ? 'YES' : 'NO'}\\n\`;
                output += \`Status: \${diagnostics.database.status.toUpperCase()}\\n\`;
                if (diagnostics.database.details.currentState) {
                    const state = diagnostics.database.details.currentState;
                    output += \`Current State: \${state.readyStateText} (\${state.readyState})\\n\`;
                    output += \`Host: \${state.host}\\n\`;
                    output += \`Database: \${state.database}\\n\`;
                }
                if (diagnostics.database.operations) {
                    const ops = diagnostics.database.operations;
                    if (ops.ping) {
                        output += \`Ping: \${ops.ping.success ? 'SUCCESS' : 'FAILED'}\`;
                        if (ops.ping.time) output += \` (\${ops.ping.time})\`;
                        output += \`\\n\`;
                    }
                    if (ops.stats && ops.stats.success) {
                        output += \`Collections: \${ops.stats.collections}\\n\`;
                        output += \`Objects: \${ops.stats.objects}\\n\`;
                    }
                }
                output += \`\\n\`;
                
                // MongoDB Check
                output += \`🍃 MONGODB STATUS\\n\`;
                if (diagnostics.mongodb.version) {
                    output += \`Version: \${diagnostics.mongodb.version}\\n\`;
                }
                if (diagnostics.mongodb.health && diagnostics.mongodb.health.replicaSet) {
                    const rs = diagnostics.mongodb.health.replicaSet;
                    if (rs.set) {
                        output += \`Replica Set: \${rs.set} (\${rs.members} members)\\n\`;
                        output += \`Primary: \${rs.primary}\\n\`;
                    }
                }
                if (diagnostics.mongodb.error) {
                    output += \`Error: \${diagnostics.mongodb.error}\\n\`;
                }
                output += \`\\n\`;
                
                // Recommendations
                if (diagnostics.recommendations.length > 0) {
                    output += \`💡 RECOMMENDATIONS\\n\`;
                    diagnostics.recommendations.forEach((rec, i) => {
                        output += \`\${i + 1}. [\${rec.priority.toUpperCase()}] \${rec.issue}\\n\`;
                        output += \`   Action: \${rec.action}\\n\`;
                        if (rec.details && rec.details.length > 0) {
                            rec.details.forEach(detail => {
                                output += \`   - \${detail}\\n\`;
                            });
                        }
                        output += \`\\n\`;
                    });
                }
                
                resultsDiv.innerHTML = \`<div class="results \${className}">\${output}</div>\`;
                
            } catch (error) {
                resultsDiv.innerHTML = \`<div class="results error">Error: \${error.message}</div>\`;
            }
            
            button.disabled = false;
            button.innerHTML = 'Run Full Diagnostics';
        }
        
        // Auto-run quick test on page load
        window.addEventListener('load', () => {
            setTimeout(runQuickTest, 1000);
        });
    </script>
</body>
</html>`;
}
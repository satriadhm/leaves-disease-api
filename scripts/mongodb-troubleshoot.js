// scripts/mongodb-troubleshoot.js - Advanced MongoDB Connection Troubleshooting
require('dotenv').config();
const mongoose = require('mongoose');

class MongoDBTroubleshooter {
  constructor() {
    this.results = {
      environment: {},
      connectionString: {},
      atlas: {},
      authentication: {},
      network: {},
      recommendations: []
    };
  }

  // ANSI colors for console output
  colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
  };

  log(message, color = 'reset') {
    console.log(`${this.colors[color]}${message}${this.colors.reset}`);
  }

  async checkEnvironmentVariables() {
    this.log('\n🔧 Step 1: Checking Environment Variables...', 'cyan');
    
    const dbUri = process.env.MONGODB_URI;
    
    if (!dbUri) {
      this.log('❌ MONGODB_URI environment variable not found!', 'red');
      this.results.recommendations.push('Set MONGODB_URI environment variable');
      return false;
    }
    
    this.log('✅ MONGODB_URI environment variable found', 'green');
    
    // Mask the URI for display
    const maskedUri = dbUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    this.log(`📍 MONGODB_URI (masked): ${maskedUri}`, 'blue');
    
    this.results.environment.hasDbUri = true;
    this.results.environment.maskedUri = maskedUri;
    
    return true;
  }

  analyzeConnectionString() {
    this.log('\n🔍 Step 2: Analyzing Connection String Format...', 'cyan');
    
    const dbUri = process.env.MONGODB_URI;
    const analysis = {
      valid: true,
      issues: [],
      components: {}
    };

    // Check protocol
    if (dbUri.startsWith('mongodb+srv://')) {
      this.log('✅ Protocol: mongodb+srv:// (correct for Atlas)', 'green');
      analysis.components.protocol = 'mongodb+srv';
    } else if (dbUri.startsWith('mongodb://')) {
      this.log('⚠️  Protocol: mongodb:// (should be mongodb+srv:// for Atlas)', 'yellow');
      analysis.issues.push('Use mongodb+srv:// protocol for MongoDB Atlas');
      analysis.components.protocol = 'mongodb';
    } else {
      this.log('❌ Invalid protocol', 'red');
      analysis.valid = false;
      analysis.issues.push('Invalid connection string protocol');
    }

    // Extract components
    try {
      const url = new URL(dbUri);
      analysis.components.hostname = url.hostname;
      analysis.components.username = url.username;
      analysis.components.password = url.password ? '***' : null;
      analysis.components.database = url.pathname.replace('/', '');
      analysis.components.searchParams = Object.fromEntries(url.searchParams);

      this.log(`✅ Hostname: ${analysis.components.hostname}`, 'green');
      this.log(`✅ Username: ${analysis.components.username}`, 'green');
      this.log(`${analysis.components.password ? '✅' : '❌'} Password: ${analysis.components.password ? 'Present' : 'Missing'}`, 
               analysis.components.password ? 'green' : 'red');
      this.log(`✅ Database: ${analysis.components.database || 'Default'}`, 'green');

      // Check for common issues
      if (!analysis.components.password) {
        analysis.issues.push('Password missing from connection string');
        analysis.valid = false;
      }

      if (!analysis.components.hostname.includes('mongodb.net')) {
        analysis.issues.push('Hostname does not appear to be MongoDB Atlas');
      }

      if (!analysis.components.database) {
        analysis.issues.push('Database name missing from connection string');
      }

    } catch (error) {
      this.log('❌ Connection string format error', 'red');
      analysis.valid = false;
      analysis.issues.push('Invalid connection string format');
    }

    // Display issues
    if (analysis.issues.length > 0) {
      this.log('\n⚠️  Connection String Issues:', 'yellow');
      analysis.issues.forEach(issue => this.log(`   - ${issue}`, 'yellow'));
    }

    this.results.connectionString = analysis;
    return analysis.valid;
  }

  async testBasicConnection() {
    this.log('\n🔌 Step 3: Testing Basic Connection...', 'cyan');
    
    try {
      // Test with minimal timeout
      const testOptions = {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 8000
      };

      this.log('🔄 Attempting connection...', 'blue');
      const startTime = Date.now();
      
      await mongoose.connect(process.env.MONGODB_URI, testOptions);
      
      const connectionTime = Date.now() - startTime;
      this.log(`✅ Connection successful in ${connectionTime}ms`, 'green');
      
      // Get connection details
      const db = mongoose.connection.db;
      const admin = db.admin();
      
      this.log(`📊 Database: ${db.databaseName}`, 'green');
      this.log(`🏠 Host: ${mongoose.connection.host}`, 'green');
      this.log(`🔌 Ready State: ${mongoose.connection.readyState}`, 'green');

      // Test database operations
      await this.testDatabaseOperations();
      
      await mongoose.disconnect();
      this.log('🔌 Disconnected successfully', 'blue');
      
      this.results.network.connected = true;
      this.results.network.connectionTime = connectionTime;
      
      return true;

    } catch (error) {
      this.log(`❌ Connection failed: ${error.message}`, 'red');
      
      // Analyze specific errors
      this.analyzeConnectionError(error);
      
      this.results.network.connected = false;
      this.results.network.error = error.message;
      
      return false;
    }
  }

  analyzeConnectionError(error) {
    this.log('\n🔍 Error Analysis:', 'cyan');
    
    if (error.message.includes('Authentication failed')) {
      this.log('🔐 AUTHENTICATION ERROR', 'red');
      this.log('   Possible causes:', 'yellow');
      this.log('   - Wrong username or password', 'yellow');
      this.log('   - User does not exist', 'yellow');
      this.log('   - Password contains special characters that need encoding', 'yellow');
      this.results.recommendations.push('Check database user credentials in MongoDB Atlas');
      this.results.recommendations.push('Verify user exists in Database Access section');
      
    } else if (error.message.includes('IP') || error.message.includes('whitelist')) {
      this.log('🌐 IP WHITELIST ERROR', 'red');
      this.log('   - IP Access List issue (but you said 0.0.0.0/0 is added)', 'yellow');
      this.results.recommendations.push('Double-check IP Access List in Network Access');
      
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      this.log('🌍 DNS/HOSTNAME ERROR', 'red');
      this.log('   Possible causes:', 'yellow');
      this.log('   - Incorrect cluster hostname', 'yellow');
      this.log('   - Network connectivity issues', 'yellow');
      this.results.recommendations.push('Verify cluster hostname in connection string');
      
    } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      this.log('⏱️ TIMEOUT ERROR', 'red');
      this.log('   Possible causes:', 'yellow');
      this.log('   - Cluster is paused or sleeping', 'yellow');
      this.log('   - Network latency issues', 'yellow');
      this.log('   - Cluster is under heavy load', 'yellow');
      this.results.recommendations.push('Check if cluster is paused in MongoDB Atlas');
      this.results.recommendations.push('Try increasing timeout values');
      
    } else if (error.message.includes('MongooseServerSelectionError')) {
      this.log('🎯 SERVER SELECTION ERROR', 'red');
      this.log('   This is a general connectivity error', 'yellow');
      this.results.recommendations.push('Check all: IP whitelist, credentials, cluster status');
      
    } else {
      this.log('❓ UNKNOWN ERROR', 'red');
      this.log(`   Message: ${error.message}`, 'yellow');
    }
  }

  async testDatabaseOperations() {
    this.log('\n🧪 Testing Database Operations...', 'cyan');
    
    try {
      const db = mongoose.connection.db;
      
      // Test 1: List collections
      const collections = await db.listCollections().toArray();
      this.log(`✅ Collections: ${collections.length} found`, 'green');
      
      // Test 2: Ping database
      const pingResult = await db.admin().ping();
      this.log('✅ Database ping successful', 'green');
      
      // Test 3: Get database stats
      const stats = await db.stats();
      this.log(`✅ Database stats: ${stats.collections} collections, ${stats.objects} objects`, 'green');
      
      return true;
      
    } catch (error) {
      this.log(`❌ Database operation failed: ${error.message}`, 'red');
      return false;
    }
  }

  async checkAtlasClusterStatus() {
    this.log('\n☁️  Step 4: Atlas Cluster Status Check...', 'cyan');
    this.log('Manual checks required:', 'blue');
    this.log('1. Go to https://cloud.mongodb.com', 'blue');
    this.log('2. Select your project', 'blue');
    this.log('3. Check cluster status should be "Running"', 'blue');
    this.log('4. Check "Database Access" for user permissions', 'blue');
    this.log('5. Check "Network Access" for IP whitelist', 'blue');
  }

  async checkDatabaseUser() {
    this.log('\n👤 Step 5: Database User Check...', 'cyan');
    
    const connectionString = process.env.MONGODB_URI;
    if (!connectionString) return;

    try {
      const url = new URL(connectionString);
      const username = url.username;
      
      this.log(`📋 Manual verification needed for user: ${username}`, 'blue');
      this.log('Check in MongoDB Atlas:', 'blue');
      this.log('1. Database Access → Database Users', 'blue');
      this.log(`2. Verify user "${username}" exists`, 'blue');
      this.log('3. Check user has "readWrite" or "Atlas admin" role', 'blue');
      this.log('4. Verify password is correct', 'blue');
      this.log('5. Check user is assigned to correct database', 'blue');
      
    } catch (error) {
      this.log('❌ Could not extract username from connection string', 'red');
    }
  }

  generateConnectionStringTemplate() {
    this.log('\n📝 Connection String Template...', 'cyan');
    
    const template = `mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/<database-name>?retryWrites=true&w=majority`;
    
    this.log('✅ Correct format:', 'green');
    this.log(template, 'blue');
    
    this.log('\n🔧 Example:', 'cyan');
    const example = `mongodb+srv://myuser:mypass123@cluster0.abcde.mongodb.net/plant_disease_api?retryWrites=true&w=majority`;
    this.log(example, 'blue');
    
    this.log('\n⚠️  Common mistakes to avoid:', 'yellow');
    this.log('❌ mongodb://... (missing srv)', 'red');
    this.log('❌ Missing password', 'red');
    this.log('❌ Missing database name', 'red');
    this.log('❌ Special characters in password not URL-encoded', 'red');
  }

  async testEnvironmentVariables() {
    this.log('\n🔧 Environment Variables Test...', 'cyan');
    
    const envVars = [
      'MONGODB_URI',
      'JWT_SECRET', 
      'NODE_ENV',
      'ADMIN_USERNAME',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD'
    ];

    envVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        if (varName.includes('URI') || varName.includes('SECRET') || varName.includes('PASSWORD')) {
          this.log(`✅ ${varName}: Set (${value.length} chars)`, 'green');
        } else {
          this.log(`✅ ${varName}: ${value}`, 'green');
        }
      } else {
        this.log(`❌ ${varName}: Not set`, 'red');
        if (varName === 'MONGODB_URI') {
          this.results.recommendations.push('MONGODB_URI environment variable is required');
        }
      }
    });
  }

  generateVercelEnvCheck() {
    this.log('\n🚀 Vercel Environment Variables Check...', 'cyan');
    this.log('Run these commands to verify Vercel env vars:', 'blue');
    this.log('', 'reset');
    this.log('# Check if variables are set in Vercel', 'blue');
    this.log('vercel env ls', 'blue');
    this.log('', 'reset');
    this.log('# Pull environment variables to local', 'blue');
    this.log('vercel env pull .env.local', 'blue');
    this.log('', 'reset');
    this.log('# Test with local env file', 'blue');
    this.log('node -r dotenv/config scripts/mongodb-troubleshoot.js', 'blue');
  }

  async generateReport() {
    this.log('\n📋 TROUBLESHOOTING REPORT', 'bold');
    this.log('=' .repeat(60), 'blue');

    // Environment summary
    if (this.results.environment.hasDbUri) {
      this.log('\n✅ Environment Variables: OK', 'green');
    } else {
      this.log('\n❌ Environment Variables: MISSING MONGODB_URI', 'red');
    }

    // Connection string summary
    if (this.results.connectionString.valid) {
      this.log('✅ Connection String Format: OK', 'green');
    } else {
      this.log('❌ Connection String Format: ISSUES FOUND', 'red');
      this.results.connectionString.issues?.forEach(issue => {
        this.log(`   - ${issue}`, 'red');
      });
    }

    // Network summary
    if (this.results.network.connected) {
      this.log(`✅ Database Connection: OK (${this.results.network.connectionTime}ms)`, 'green');
    } else {
      this.log('❌ Database Connection: FAILED', 'red');
      if (this.results.network.error) {
        this.log(`   Error: ${this.results.network.error}`, 'red');
      }
    }

    // Recommendations
    if (this.results.recommendations.length > 0) {
      this.log('\n🔧 RECOMMENDED ACTIONS:', 'yellow');
      this.results.recommendations.forEach((rec, index) => {
        this.log(`   ${index + 1}. ${rec}`, 'yellow');
      });
    }

    this.log('\n' + '=' .repeat(60), 'blue');
  }

  async runFullDiagnosis() {
    this.log('🔍 MongoDB Atlas Connection Troubleshooter', 'bold');
    this.log('=' .repeat(60), 'blue');

    let allPassed = true;

    // Step 1: Environment variables
    const hasEnv = await this.checkEnvironmentVariables();
    allPassed = hasEnv && allPassed;

    if (!hasEnv) {
      this.log('\n❌ Cannot proceed without MONGODB_URI environment variable', 'red');
      await this.generateReport();
      return false;
    }

    // Step 2: Connection string analysis
    const validFormat = this.analyzeConnectionString();
    allPassed = validFormat && allPassed;

    // Step 3: Test environment variables
    await this.testEnvironmentVariables();

    // Step 4: Connection test
    const connected = await this.testBasicConnection();
    allPassed = connected && allPassed;

    // Step 5: Manual checks guidance
    await this.checkAtlasClusterStatus();
    await this.checkDatabaseUser();

    // Step 6: Help and templates
    this.generateConnectionStringTemplate();
    this.generateVercelEnvCheck();

    // Final report
    await this.generateReport();

    return allPassed;
  }
}

// Quick connection test function
async function quickConnectionTest() {
  console.log('⚡ Quick Connection Test...\n');
  
  if (!process.env.MONGODB_URI) {
    console.log('❌ MONGODB_URI environment variable not found');
    console.log('💡 Create .env file with your MongoDB connection string');
    return;
  }

  try {
    console.log('🔄 Testing connection...');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });
    
    console.log('✅ Connection successful!');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    console.log(`🏠 Host: ${mongoose.connection.host}`);
    
    // Quick ping test
    await mongoose.connection.db.admin().ping();
    console.log('✅ Database ping successful');
    
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
    
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    
    // Quick error analysis
    if (error.message.includes('Authentication')) {
      console.log('💡 Check: Username/password in MongoDB Atlas Database Access');
    } else if (error.message.includes('IP')) {
      console.log('💡 Check: IP Access List in MongoDB Atlas Network Access');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Check: Cluster status in MongoDB Atlas (might be paused)');
    }
  }
}

// Run diagnostics if this file is executed directly
if (require.main === module) {
  const troubleshooter = new MongoDBTroubleshooter();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    quickConnectionTest();
  } else {
    troubleshooter.runFullDiagnosis().then(success => {
      console.log(success ? '\n🎉 All checks passed!' : '\n❌ Issues found - see recommendations above');
      process.exit(success ? 0 : 1);
    });
  }
}

module.exports = { MongoDBTroubleshooter, quickConnectionTest };
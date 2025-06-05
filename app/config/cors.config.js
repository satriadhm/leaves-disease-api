// app/config/cors.config.js
class CorsConfig {
  constructor() {
    this.corsOptions = {
      origin: this.originFunction,
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
  }

  originFunction(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Localhost patterns
    const localhostRegex = /^http:\/\/localhost:\d+$/;
    const localhostIPRegex = /^http:\/\/127\.0\.0\.1:\d+$/;
    const localhostIPv4Regex = /^http:\/\/192\.168\.\d+\.\d+:\d+$/;

    if (localhostRegex.test(origin) || localhostIPRegex.test(origin) || localhostIPv4Regex.test(origin)) {
      return callback(null, true);
    }

    // Development tunneling services
    const tunnelServices = [
      'ngrok.io',
      'ngrok-free.app',
      'ngrok.app',
      'ngrok.dev',
      'loca.lt',
      'serveo.net'
    ];

    if (tunnelServices.some(service => origin.includes(service))) {
      return callback(null, true);
    }

    // Vercel and Netlify
    const deploymentServices = [
      'vercel.app',
      'vercel.sh',
      'now.sh',
      'netlify.app',
      'netlify.com'
    ];

    if (deploymentServices.some(service => origin.includes(service))) {
      return callback(null, true);
    }

    // GitHub Pages
    if (origin.includes('github.io')) {
      return callback(null, true);
    }

    // Environment-specific allowed origins
    const allowedOrigins = (process.env.CLIENT_ORIGIN || '').split(',').filter(Boolean);
    if (allowedOrigins.some(allowedOrigin => origin === allowedOrigin.trim())) {
      return callback(null, true);
    }

    // Production HTTPS origins
    if (process.env.NODE_ENV === 'production' && origin.startsWith('https://')) {
      return callback(null, true);
    }

    // Development mode - allow all
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // Log blocked origin for debugging
    console.log('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  }

  getCorsOptions() {
    return this.corsOptions;
  }

  // Method to add custom origins dynamically
  addAllowedOrigin(origin) {
    const currentOrigins = process.env.CLIENT_ORIGIN || '';
    const newOrigins = currentOrigins ? `${currentOrigins},${origin}` : origin;
    process.env.CLIENT_ORIGIN = newOrigins;
  }

  // Method to check if origin is allowed
  isOriginAllowed(origin) {
    return new Promise((resolve) => {
      this.originFunction(origin, (err, allowed) => {
        resolve(!err && allowed);
      });
    });
  }
}

// Create singleton instance
const corsConfig = new CorsConfig();

module.exports = corsConfig;
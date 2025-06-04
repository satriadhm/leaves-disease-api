// app/middleware/optionalAuth.js
const jwt = require('jsonwebtoken');
const config = require('../config/auth.config.js');

// Middleware untuk auth opsional (tidak wajib login)
const optionalAuth = (req, res, next) => {
  const token = req.headers["x-access-token"];
  
  if (!token) {
    // Jika tidak ada token, lanjutkan tanpa userId
    req.userId = null;
    return next();
  }
  
  jwt.verify(token, config.secret, (err, decoded) => {
    if (err) {
      // Jika token invalid, lanjutkan tanpa userId
      req.userId = null;
    } else {
      // Jika token valid, set userId
      req.userId = decoded.id;
    }
    next();
  });
};

module.exports = { optionalAuth }; // Export as named export
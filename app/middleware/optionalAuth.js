const jwt = require('jsonwebtoken');
const config = require('../config/auth.config.js');

const optionalAuth = (req, res, next) => {
  const token = req.headers["x-access-token"];
  
  if (!token) {
    req.userId = null;
    return next();
  }
  
  jwt.verify(token, config.secret, (err, decoded) => {
    if (err) {
      req.userId = null;
    } else {
      req.userId = decoded.id;
    }
    next();
  });
};

module.exports = { optionalAuth }; // Export as named export
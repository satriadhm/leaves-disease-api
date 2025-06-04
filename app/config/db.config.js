module.exports = {
  HOST: process.env.DB_HOST || "localhost",
  PORT: process.env.DB_PORT || 27017,
  DB: process.env.DB_NAME || "auth_service",
  URI: process.env.DB_URI || "mongodb://127.0.0.1:27017/auth_service"
};

// app/models/index.js
const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const db = {};

db.mongoose = mongoose;

// Import all models
db.user = require("./user.model");
db.role = require("./role.model");
db.prediction = require("./prediction.model");
db.blacklistedToken = require("./blacklistedToken.model");

// Available roles
db.ROLES = ["user", "admin", "moderator"];

module.exports = db;
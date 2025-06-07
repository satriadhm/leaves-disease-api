const mongoose = require('mongoose');

const BlacklistedTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    enum: ['logout', 'password_change', 'account_deactivated', 'security_breach'],
    default: 'logout'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true
});

BlacklistedTokenSchema.index({ token: 1, expiresAt: 1 });

BlacklistedTokenSchema.statics.isBlacklisted = function(token) {
  return this.findOne({ 
    token: token, 
    expiresAt: { $gt: new Date() } 
  });
};

// Static method to blacklist token
BlacklistedTokenSchema.statics.blacklistToken = function(token, userId, reason = 'logout', expiresIn = 86400000) {
  return this.create({
    token: token,
    userId: userId,
    reason: reason,
    expiresAt: new Date(Date.now() + expiresIn)
  });
};

// Static method to cleanup expired tokens (manual cleanup if needed)
BlacklistedTokenSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

const BlacklistedToken = mongoose.model('BlacklistedToken', BlacklistedTokenSchema);

module.exports = BlacklistedToken;
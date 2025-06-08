// app/models/prediction.model.js - Enhanced version with image metadata
const mongoose = require('mongoose');

const PredictionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.predictionType === 'authenticated';
    }
  },
  imageName: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true,
    index: true
  },
  imageFullUrl: {
    type: String,
    default: null
  },
  imagePublicUrl: {
    type: String,
    default: null
  },
  imageMetadata: {
    filename: String,
    originalName: String,
    size: Number,
    mimetype: String,
    detectedFormat: String
  },
  predictedClass: {
    type: String,
    required: true,
    index: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  allPredictions: [{
    class: String,
    confidence: Number
  }],
  predictionType: {
    type: String,
    enum: ['authenticated', 'anonymous'],
    default: 'anonymous',
    index: true
  },
  storageType: {
    type: String,
    enum: ['local', 'cloud'],
    default: 'local',
    index: true
  },
  deviceInfo: {
    userAgent: String,
    ip: String
  },
  processingTime: {
    type: Number, 
    required: true
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for better performance
PredictionSchema.index({ userId: 1, createdAt: -1 });
PredictionSchema.index({ createdAt: -1 });
PredictionSchema.index({ predictedClass: 1, createdAt: -1 });
PredictionSchema.index({ predictionType: 1, createdAt: -1 });
PredictionSchema.index({ storageType: 1 });

// Virtual for image access URLs
PredictionSchema.virtual('imageAccessUrls').get(function() {
  if (!this.imageUrl) return null;
  
  const filename = require('path').basename(this.imageUrl);
  const baseUrls = {
    relative: this.imageUrl,
    filename: filename
  };
  
  // Add public URLs if available
  if (this.imagePublicUrl) {
    baseUrls.public = this.imagePublicUrl;
  }
  
  if (this.imageFullUrl) {
    baseUrls.full = this.imageFullUrl;
  }
  
  return baseUrls;
});

// Method to update image URLs
PredictionSchema.methods.updateImageUrls = function(req) {
  if (!this.imageUrl) return;
  
  const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  
  this.imageFullUrl = `${baseUrl}${this.imageUrl}`;
  
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    this.imagePublicUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}${this.imageUrl}`;
  } else {
    this.imagePublicUrl = this.imageFullUrl;
  }
};

// Static method to get predictions with enhanced image URLs
PredictionSchema.statics.findWithImageUrls = function(query, req, options = {}) {
  return this.find(query, null, options).then(predictions => {
    return predictions.map(prediction => {
      const predictionObj = prediction.toObject();
      
      if (predictionObj.imageUrl) {
        const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;
        const filename = require('path').basename(predictionObj.imageUrl);
        
        predictionObj.image = {
          name: predictionObj.imageName,
          filename: filename,
          url: predictionObj.imageUrl,
          fullUrl: `${baseUrl}${predictionObj.imageUrl}`,
          publicUrl: process.env.RAILWAY_PUBLIC_DOMAIN 
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}${predictionObj.imageUrl}`
            : `${baseUrl}${predictionObj.imageUrl}`,
          metadata: predictionObj.imageMetadata || {}
        };
      }
      
      return predictionObj;
    });
  });
};

PredictionSchema.pre('save', function(next) {
  if (this.imageUrl && !this.imageUrl.startsWith('/')) {
    this.imageUrl = '/' + this.imageUrl;
  }
  
  next();
});

const Prediction = mongoose.model('Prediction', PredictionSchema);

module.exports = Prediction;
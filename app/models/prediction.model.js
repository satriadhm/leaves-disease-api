// app/models/prediction.model.js - Fixed version
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
    required: true
  },
  predictedClass: {
    type: String,
    required: true
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
    default: 'anonymous'
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

PredictionSchema.index({ userId: 1, createdAt: -1 });
PredictionSchema.index({ createdAt: -1 });
PredictionSchema.index({ predictedClass: 1 });
PredictionSchema.index({ predictionType: 1 });

const Prediction = mongoose.model('Prediction', PredictionSchema);

module.exports = Prediction;
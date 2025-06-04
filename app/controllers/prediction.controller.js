// app/controllers/prediction.controller.js - Fixed version with CRUD (no update)
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require("../models");
const Prediction = db.prediction;

// Load model dan labels saat server start
let model = null;
let classNames = [];

const MODEL_PATH = path.join(__dirname, '../../models/tfjs_model/model.json');
const LABELS_PATH = path.join(__dirname, '../../models/labels.txt');

// Initialize model
const initializeModel = async () => {
  try {
    await tf.setBackend('cpu');
    console.log('TensorFlow.js backend set to CPU');
    
    if (fs.existsSync(MODEL_PATH)) {
      try {
        console.log('Loading model from:', MODEL_PATH);
        
        try {
          const modelUrl = `file://${MODEL_PATH.replace(/\\/g, '/')}`;
          console.log('Attempting to load graph model from:', modelUrl);
          model = await tf.loadGraphModel(modelUrl);
          console.log('✅ Graph model loaded successfully via URL');
        } catch (urlError) {
          console.log('URL loading failed, trying custom IO handler...');
          
          const modelData = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
          console.log('Model JSON loaded successfully');
          
          const ioHandler = {
            load: async () => {
              console.log('Loading model weights...');
              
              const modelTopology = modelData.modelTopology;
              const weightsManifest = modelData.weightsManifest;
              
              const weightData = [];
              const modelDir = path.dirname(MODEL_PATH);
              
              for (const manifest of weightsManifest) {
                for (const weightPath of manifest.paths) {
                  const weightFilePath = path.join(modelDir, weightPath);
                  if (fs.existsSync(weightFilePath)) {
                    console.log(`Reading weight file: ${weightPath}`);
                    const buffer = fs.readFileSync(weightFilePath);
                    weightData.push(buffer);
                  } else {
                    throw new Error(`Weight file not found: ${weightFilePath}`);
                  }
                }
              }
              
              const totalLength = weightData.reduce((sum, buffer) => sum + buffer.length, 0);
              const concatenated = new Uint8Array(totalLength);
              let offset = 0;
              
              for (const buffer of weightData) {
                concatenated.set(new Uint8Array(buffer), offset);
                offset += buffer.length;
              }
              
              console.log(`Total weight data size: ${totalLength} bytes`);
              
              return {
                modelTopology: modelTopology,
                weightSpecs: weightsManifest[0].weights,
                weightData: concatenated.buffer,
                format: modelData.format,
                generatedBy: modelData.generatedBy,
                convertedBy: modelData.convertedBy,
                signature: modelData.signature
              };
            }
          };
          
          model = await tf.loadGraphModel(ioHandler);
          console.log('✅ Graph model loaded successfully via custom IO handler');
        }
        
        console.log('Model input shape:', model.inputs[0].shape);
        console.log('Graph model loaded - output shape will be determined during inference');
        
        console.log('Warming up model...');
        const dummyInput = tf.zeros([1, 224, 224, 3]);
        const warmupPrediction = model.execute(dummyInput);
        
        if (Array.isArray(warmupPrediction)) {
          console.log('Model has multiple outputs, using first output');
          console.log('Output shape:', warmupPrediction[0].shape);
          warmupPrediction.forEach(p => p.dispose());
        } else {
          console.log('Output shape:', warmupPrediction.shape);
          warmupPrediction.dispose();
        }
        
        dummyInput.dispose();
        console.log('✅ Model warmed up successfully');
        
      } catch (modelError) {
        console.error('❌ Failed to load model:', modelError.message);
        console.error('Full error:', modelError);
        console.log('⚠️ Continuing with dummy predictions');
        model = null;
      }
    } else {
      console.log('⚠️ Model file not found at:', MODEL_PATH);
      console.log('⚠️ Using dummy predictions');
    }

    // Load class labels
    if (fs.existsSync(LABELS_PATH)) {
      const labelsContent = fs.readFileSync(LABELS_PATH, 'utf8');
      classNames = labelsContent.split('\n').filter(line => line.trim() !== '');
      console.log(`✅ Loaded ${classNames.length} class labels`);
      
      if (classNames.length > 0) {
        const displayClasses = classNames.slice(0, 5);
        console.log('Classes:', displayClasses.join(', '));
        if (classNames.length > 5) {
          console.log(`... and ${classNames.length - 5} more classes`);
        }
      }
    } else {
      classNames = [
        'Chili__healthy', 'Chili__leaf curl', 'Chili__leaf spot', 'Chili__whitefly',
        'Corn__common_rust', 'Corn__gray_leaf_spot', 'Corn__healthy', 'Corn__northern_leaf_blight',
        'Rice__brown_spot', 'Rice__healthy', 'Rice__leaf_blast', 'Rice__neck_blast',
        'Tomato__early_blight', 'Tomato__healthy', 'Tomato__late_blight', 'Tomato__yellow_leaf_curl_virus'
      ];
      console.log('⚠️ Labels file not found, using default labels');
      console.log(`✅ Using ${classNames.length} default class labels`);
    }
  } catch (error) {
    console.error('❌ Error initializing model:', error);
    model = null;
  }
};

// Call initialization
initializeModel();

// Preprocessing image untuk TensorFlow.js
const preprocessImage = async (imagePath) => {
  try {
    const imageBuffer = await sharp(imagePath)
      .resize(224, 224)
      .removeAlpha()
      .toColorspace('rgb')
      .raw()
      .toBuffer();

    const imageTensor = tf.tensor3d(
      new Uint8Array(imageBuffer),
      [224, 224, 3],
      'int32'
    );

    const normalizedImage = imageTensor.cast('float32').div(255.0).expandDims(0);
    imageTensor.dispose();
    
    return normalizedImage;
  } catch (error) {
    throw new Error(`Image preprocessing error: ${error.message}`);
  }
};

// Dummy prediction function
const getDummyPrediction = () => {
  const predictions = classNames.map((className, index) => ({
    class: className,
    confidence: Math.random() * 0.8 + 0.1
  }));
  
  predictions.sort((a, b) => b.confidence - a.confidence);
  
  return {
    predictedClass: predictions[0].class,
    confidence: predictions[0].confidence,
    allPredictions: predictions
  };
};

// Main prediction function (CREATE)
exports.predictPlantDisease = async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    let predictionResult;

    if (model) {
      try {
        console.log('Processing image:', req.file.path);
        const imageTensor = await preprocessImage(req.file.path);
        
        const predictions = model.execute(imageTensor);
        
        let predictionData;
        if (Array.isArray(predictions)) {
          predictionData = await predictions[0].data();
          predictions.forEach(p => p.dispose());
        } else {
          predictionData = await predictions.data();
          predictions.dispose();
        }
        
        const predictionArray = Array.from(predictionData);
        const predictedIndex = predictionArray.indexOf(Math.max(...predictionArray));
        const confidence = predictionArray[predictedIndex];
        
        const allPredictions = classNames.map((className, index) => ({
          class: className,
          confidence: predictionArray[index] || 0
        })).sort((a, b) => b.confidence - a.confidence);

        predictionResult = {
          predictedClass: classNames[predictedIndex] || 'Unknown',
          confidence: confidence,
          allPredictions: allPredictions
        };

        imageTensor.dispose();
        
      } catch (modelError) {
        console.error('Model prediction error:', modelError);
        predictionResult = getDummyPrediction();
      }
    } else {
      console.log('Using dummy prediction (model not loaded)');
      predictionResult = getDummyPrediction();
    }

    const processingTime = Date.now() - startTime;

    // Save prediction to database
    const predictionData = {
      imageName: req.file.originalname,
      imageUrl: `/uploads/${req.file.filename}`,
      predictedClass: predictionResult.predictedClass,
      confidence: predictionResult.confidence,
      allPredictions: predictionResult.allPredictions,
      predictionType: req.userId ? 'authenticated' : 'anonymous',
      deviceInfo: {
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      },
      processingTime: processingTime,
      notes: req.body.notes || ''
    };

    if (req.userId) {
      predictionData.userId = req.userId;
    }

    const savedPrediction = await new Prediction(predictionData).save();

    res.status(200).json({
      success: true,
      message: 'Prediction completed successfully',
      data: {
        id: savedPrediction._id,
        predictedClass: predictionResult.predictedClass,
        confidence: Math.round(predictionResult.confidence * 10000) / 100,
        allPredictions: predictionResult.allPredictions.slice(0, 5).map(p => ({
          class: p.class,
          confidence: Math.round(p.confidence * 10000) / 100
        })),
        imageName: req.file.originalname,
        imageUrl: predictionData.imageUrl,
        processingTime: `${processingTime}ms`,
        timestamp: savedPrediction.createdAt,
        modelStatus: model ? 'loaded' : 'dummy'
      }
    });

  } catch (error) {
    console.error('Prediction error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Prediction failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get prediction history (READ)
exports.getPredictionHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    let query = {};
    
    if (req.userId) {
      query.userId = req.userId;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view prediction history'
      });
    }

    // Add filters
    if (req.query.predictedClass) {
      query.predictedClass = { $regex: req.query.predictedClass, $options: 'i' };
    }

    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const total = await Prediction.countDocuments(query);
    const predictions = await Prediction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username email')
      .select('-deviceInfo');

    res.status(200).json({
      success: true,
      message: 'Prediction history retrieved successfully',
      data: {
        predictions: predictions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve prediction history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get prediction detail by ID (READ)
exports.getPredictionDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid prediction ID format'
      });
    }

    let query = { _id: id };
    
    if (req.userId) {
      query.userId = req.userId;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view prediction details'
      });
    }

    const prediction = await Prediction.findOne(query)
      .populate('userId', 'username email');

    if (!prediction) {
      return res.status(404).json({
        success: false,
        message: 'Prediction not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Prediction detail retrieved successfully',
      data: prediction
    });

  } catch (error) {
    console.error('Get prediction detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve prediction details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Delete prediction (DELETE)
exports.deletePrediction = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid prediction ID format'
      });
    }

    let query = { _id: id };
    
    if (req.userId) {
      query.userId = req.userId;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to delete prediction'
      });
    }

    const prediction = await Prediction.findOne(query);
    if (!prediction) {
      return res.status(404).json({
        success: false,
        message: 'Prediction not found'
      });
    }

    // Delete associated image file
    if (prediction.imageUrl) {
      const imagePath = path.join(__dirname, '../../uploads', path.basename(prediction.imageUrl));
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log('Image file deleted:', imagePath);
        } catch (fileError) {
          console.error('Error deleting image file:', fileError);
        }
      }
    }

    await Prediction.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Prediction deleted successfully'
    });

  } catch (error) {
    console.error('Delete prediction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete prediction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Admin: Get all predictions (READ)
exports.getAllPredictions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    let query = {};

    // Filters
    if (req.query.predictedClass) {
      query.predictedClass = { $regex: req.query.predictedClass, $options: 'i' };
    }

    if (req.query.predictionType) {
      query.predictionType = req.query.predictionType;
    }

    if (req.query.userId) {
      query.userId = req.query.userId;
    }

    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const total = await Prediction.countDocuments(query);
    const predictions = await Prediction.find(query)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      message: 'All predictions retrieved successfully',
      data: {
        predictions: predictions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all predictions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve predictions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Admin: Delete any prediction (DELETE)
exports.adminDeletePrediction = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid prediction ID format'
      });
    }

    const prediction = await Prediction.findById(id);
    if (!prediction) {
      return res.status(404).json({
        success: false,
        message: 'Prediction not found'
      });
    }

    // Delete associated image file
    if (prediction.imageUrl) {
      const imagePath = path.join(__dirname, '../../uploads', path.basename(prediction.imageUrl));
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log('Image file deleted:', imagePath);
        } catch (fileError) {
          console.error('Error deleting image file:', fileError);
        }
      }
    }

    await Prediction.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Prediction deleted successfully'
    });

  } catch (error) {
    console.error('Admin delete prediction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete prediction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get prediction statistics (admin only)
exports.getPredictionStats = async (req, res) => {
  try {
    const totalPredictions = await Prediction.countDocuments();
    const authenticatedPredictions = await Prediction.countDocuments({ predictionType: 'authenticated' });
    const anonymousPredictions = await Prediction.countDocuments({ predictionType: 'anonymous' });

    // Get predictions by class
    const predictionsByClass = await Prediction.aggregate([
      {
        $group: {
          _id: '$predictedClass',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Get predictions by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const predictionsByDate = await Prediction.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get average processing time
    const avgProcessingTime = await Prediction.aggregate([
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$processingTime' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Prediction statistics retrieved successfully',
      data: {
        overview: {
          totalPredictions,
          authenticatedPredictions,
          anonymousPredictions,
          avgProcessingTime: avgProcessingTime[0]?.avgTime || 0
        },
        predictionsByClass,
        predictionsByDate,
        systemInfo: {
          modelLoaded: !!model,
          totalClasses: classNames.length,
          tfBackend: tf.getBackend()
        }
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve prediction statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Health check endpoint untuk model
exports.getModelHealth = async (req, res) => {
  try {
    let modelInfo = {
      modelLoaded: !!model,
      modelPath: MODEL_PATH,
      labelsPath: LABELS_PATH,
      totalClasses: classNames.length,
      tfBackend: tf.getBackend(),
      memoryInfo: tf.memory(),
      modelExists: fs.existsSync(MODEL_PATH),
      labelsExists: fs.existsSync(LABELS_PATH),
      modelType: model ? 'GraphModel' : 'Not loaded'
    };
    
    if (model) {
      try {
        modelInfo.inputShape = model.inputs[0].shape;
        
        const testInput = tf.zeros([1, 224, 224, 3]);
        const testOutput = model.execute(testInput);
        
        if (Array.isArray(testOutput)) {
          modelInfo.outputShape = testOutput[0].shape;
          modelInfo.numOutputs = testOutput.length;
          testOutput.forEach(p => p.dispose());
        } else {
          modelInfo.outputShape = testOutput.shape;
          modelInfo.numOutputs = 1;
          testOutput.dispose();
        }
        
        testInput.dispose();
      } catch (error) {
        modelInfo.shapeError = error.message;
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Model health check',
      data: modelInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
};
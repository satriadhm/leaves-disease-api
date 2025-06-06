// app/middleware/upload.js - Updated for local storage
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory at:', uploadsDir);
}

// Disk storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = 'plant-' + uniqueSuffix + extension;
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  console.log('📎 File received:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    console.log('✅ File type accepted');
    cb(null, true);
  } else {
    console.log('❌ File type rejected:', file.mimetype, fileExtension);
    cb(new Error(`Invalid file type. Only JPEG, PNG, and WebP images are allowed. Received: ${file.mimetype}`), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only one file at a time
  }
});

// Middleware untuk single file upload
const uploadSingle = (req, res, next) => {
  const uploadHandler = upload.single('image');
  
  uploadHandler(req, res, (err) => {
    if (err) {
      console.error('💥 Upload error:', err.message);
      return next(err);
    }
    
    if (req.file) {
      console.log('✅ File uploaded successfully:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      });
      
      // Add additional file info
      req.file.url = `/uploads/${req.file.filename}`;
      req.file.storageType = 'local';
    }
    
    next();
  });
};

// Error handling middleware
const handleUploadErrors = (err, req, res, next) => {
  console.error('🚨 Upload error handler:', err.message);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.',
        error: 'FILE_TOO_LARGE'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file is allowed.',
        error: 'TOO_MANY_FILES'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field. Use "image" field name.',
        error: 'UNEXPECTED_FIELD'
      });
    }
  }
  
  if (err && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  // Generic upload error
  if (err) {
    return res.status(400).json({
      success: false,
      message: 'File upload failed: ' + err.message,
      error: 'UPLOAD_FAILED'
    });
  }
  
  next(err);
};

// Helper function to delete uploaded file
const deleteUploadedFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('🗑️ Deleted file:', filePath);
      return true;
    }
  } catch (error) {
    console.error('❌ Error deleting file:', filePath, error.message);
  }
  return false;
};

// Helper function to clean old files (optional)
const cleanOldFiles = (maxAgeHours = 24) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    
    let deletedCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime.getTime();
      
      if (age > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });
    
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned ${deletedCount} old files`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('❌ Error cleaning old files:', error.message);
    return 0;
  }
};

// Periodic cleanup (run every hour)
const startPeriodicCleanup = () => {
  setInterval(() => {
    cleanOldFiles(24); // Delete files older than 24 hours
  }, 60 * 60 * 1000); // Run every hour
};

module.exports = {
  uploadSingle,
  handleUploadErrors,
  deleteUploadedFile,
  cleanOldFiles,
  startPeriodicCleanup,
  uploadsDir
};
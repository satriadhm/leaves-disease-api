// app/middleware/upload.js - Railway Compatible Version
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Railway-compatible uploads directory detection
const uploadsDir = process.env.NODE_ENV === 'production'
  ? path.join(process.cwd(), 'uploads')
  : path.join(__dirname, '../../uploads');

// Ensure uploads directory exists with proper error handling
function ensureUploadsDirectory() {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('📁 Created uploads directory at:', uploadsDir);
    }
    
    // Test write permissions
    const testFile = path.join(uploadsDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log('✅ Upload directory is writable:', uploadsDir);
    return true;
  } catch (error) {
    console.error('❌ Failed to setup uploads directory:', error.message);
    
    // For Railway, try alternative directory
    if (process.env.NODE_ENV === 'production') {
      try {
        const altDir = path.join('/tmp', 'uploads');
        if (!fs.existsSync(altDir)) {
          fs.mkdirSync(altDir, { recursive: true });
        }
        console.log('📁 Using alternative uploads directory:', altDir);
        return altDir;
      } catch (altError) {
        console.error('❌ Failed to create alternative directory:', altError.message);
        return false;
      }
    }
    return false;
  }
}

// Initialize directory
const uploadsDirResult = ensureUploadsDirectory();
const finalUploadsDir = typeof uploadsDirResult === 'string' ? uploadsDirResult : uploadsDir;

// Enhanced disk storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Double-check directory exists before each upload
    try {
      if (!fs.existsSync(finalUploadsDir)) {
        fs.mkdirSync(finalUploadsDir, { recursive: true });
      }
      cb(null, finalUploadsDir);
    } catch (error) {
      console.error('❌ Upload destination error:', error.message);
      cb(error, null);
    }
  },
  filename: function (req, file, cb) {
    try {
      // Generate unique filename with timestamp and random suffix
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname).toLowerCase();
      
      // Validate extension
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      if (!allowedExtensions.includes(extension)) {
        return cb(new Error(`Invalid file extension: ${extension}. Allowed: ${allowedExtensions.join(', ')}`));
      }
      
      const filename = 'plant-' + uniqueSuffix + extension;
      
      console.log('📎 Generating filename:', {
        original: file.originalname,
        generated: filename,
        extension: extension,
        size: file.size || 'unknown'
      });
      
      cb(null, filename);
    } catch (error) {
      console.error('❌ Filename generation error:', error.message);
      cb(error, null);
    }
  }
});

// Enhanced file filter function
const fileFilter = (req, file, cb) => {
  console.log('📎 File filter check:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname
  });

  // Allowed MIME types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png', 
    'image/webp'
  ];
  
  // Allowed file extensions
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    console.log('❌ Invalid MIME type:', file.mimetype);
    return cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
  }
  
  // Check file extension
  if (!allowedExtensions.includes(fileExtension)) {
    console.log('❌ Invalid file extension:', fileExtension);
    return cb(new Error(`Invalid file extension: ${fileExtension}. Allowed extensions: ${allowedExtensions.join(', ')}`), false);
  }
  
  // Additional security check: verify file name doesn't contain dangerous characters
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    console.log('❌ Dangerous filename detected:', file.originalname);
    return cb(new Error('Invalid filename: contains dangerous characters'), false);
  }
  
  console.log('✅ File passed all checks');
  cb(null, true);
};

// Enhanced multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only one file at a time
    fieldSize: 10 * 1024 * 1024, // 10MB field size limit
    fields: 10, // Maximum number of non-file fields
    parts: 20 // Maximum number of parts (files + fields)
  },
  onError: function(err, next) {
    console.error('💥 Multer error:', err.message);
    next(err);
  }
});

// Enhanced middleware for single file upload
const uploadSingle = (req, res, next) => {
  const uploadHandler = upload.single('image');
  
  uploadHandler(req, res, (err) => {
    if (err) {
      console.error('💥 Upload handler error:', err.message);
      return next(err);
    }
    
    if (req.file) {
      try {
        // Add additional file information
        req.file.url = `/uploads/${req.file.filename}`;
        req.file.storageType = 'local';
        req.file.uploadTimestamp = new Date().toISOString();
        req.file.uploadsDirectory = finalUploadsDir;
        
        // Railway-specific: Add public URL if available
        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
          req.file.publicUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/uploads/${req.file.filename}`;
        }
        
        console.log('✅ File uploaded successfully:', {
          filename: req.file.filename,
          originalname: req.file.originalname,
          size: req.file.size,
          path: req.file.path,
          url: req.file.url,
          mimetype: req.file.mimetype
        });
        
        // Verify file was actually written
        if (!fs.existsSync(req.file.path)) {
          console.error('❌ File not found after upload:', req.file.path);
          return next(new Error('File upload failed: file not saved to disk'));
        }
        
        // Verify file size matches
        const actualSize = fs.statSync(req.file.path).size;
        if (actualSize !== req.file.size) {
          console.error('❌ File size mismatch:', { expected: req.file.size, actual: actualSize });
          deleteUploadedFile(req.file.path);
          return next(new Error('File upload failed: size mismatch'));
        }
        
      } catch (verifyError) {
        console.error('❌ File verification error:', verifyError.message);
        if (req.file && req.file.path) {
          deleteUploadedFile(req.file.path);
        }
        return next(new Error('File upload failed: verification error'));
      }
    }
    
    next();
  });
};

// Enhanced error handling middleware
const handleUploadErrors = (err, req, res, next) => {
  console.error('🚨 Upload error handler:', err.message);
  
  // Clean up any uploaded file if error occurs
  if (req.file && req.file.path && fs.existsSync(req.file.path)) {
    console.log('🧹 Cleaning up file due to error:', req.file.path);
    deleteUploadedFile(req.file.path);
  }
  
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB.',
          error: 'FILE_TOO_LARGE',
          maxSize: '5MB'
        });
        
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Only one file is allowed.',
          error: 'TOO_MANY_FILES',
          maxFiles: 1
        });
        
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field. Use "image" field name.',
          error: 'UNEXPECTED_FIELD',
          expectedField: 'image'
        });
        
      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many parts in the request.',
          error: 'TOO_MANY_PARTS'
        });
        
      case 'LIMIT_FIELD_KEY':
        return res.status(400).json({
          success: false,
          message: 'Field name too long.',
          error: 'FIELD_NAME_TOO_LONG'
        });
        
      case 'LIMIT_FIELD_VALUE':
        return res.status(400).json({
          success: false,
          message: 'Field value too long.',
          error: 'FIELD_VALUE_TOO_LONG'
        });
        
      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many fields.',
          error: 'TOO_MANY_FIELDS'
        });
        
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.code}`,
          error: 'MULTER_ERROR'
        });
    }
  }
  
  // Custom file filter errors
  if (err && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      error: 'INVALID_FILE_TYPE',
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
    });
  }
  
  if (err && err.message.includes('Invalid file extension')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      error: 'INVALID_FILE_EXTENSION',
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp']
    });
  }
  
  // File system errors
  if (err && err.message.includes('ENOSPC')) {
    return res.status(507).json({
      success: false,
      message: 'Not enough storage space available.',
      error: 'INSUFFICIENT_STORAGE'
    });
  }
  
  if (err && err.message.includes('EACCES')) {
    return res.status(500).json({
      success: false,
      message: 'Permission denied. Unable to save file.',
      error: 'PERMISSION_DENIED'
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

// Enhanced helper function to delete uploaded file
const deleteUploadedFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('🗑️ Deleted file:', filePath);
      return true;
    } else {
      console.log('⚠️ File not found for deletion:', filePath);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting file:', filePath, error.message);
    return false;
  }
};

// Enhanced function to clean old files with Railway optimizations
const cleanOldFiles = (maxAgeHours = 24) => {
  try {
    if (!fs.existsSync(finalUploadsDir)) {
      console.log('⚠️ Uploads directory does not exist for cleanup');
      return 0;
    }
    
    const files = fs.readdirSync(finalUploadsDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    
    let deletedCount = 0;
    let totalFiles = 0;
    let errors = 0;
    
    files.forEach(file => {
      try {
        // Skip hidden files and .gitkeep
        if (file.startsWith('.')) {
          return;
        }
        
        const filePath = path.join(finalUploadsDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();
        
        totalFiles++;
        
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`🧹 Cleaned old file: ${file} (age: ${(age / 1000 / 60 / 60).toFixed(1)}h)`);
        }
      } catch (fileError) {
        errors++;
        console.error(`❌ Error processing file ${file}:`, fileError.message);
      }
    });
    
    if (deletedCount > 0) {
      console.log(`✅ Cleanup completed: ${deletedCount}/${totalFiles} files deleted, ${errors} errors`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('❌ Error during file cleanup:', error.message);
    return 0;
  }
};

// Enhanced periodic cleanup with error handling
const startPeriodicCleanup = () => {
  console.log('🧹 Starting periodic file cleanup service...');
  
  // Run cleanup immediately
  setTimeout(() => {
    cleanOldFiles(24);
  }, 30000); // 30 seconds after startup
  
  // Then run every hour
  const cleanupInterval = setInterval(() => {
    try {
      const deletedCount = cleanOldFiles(24); // Delete files older than 24 hours
      
      // Log storage usage periodically
      if (fs.existsSync(finalUploadsDir)) {
        const files = fs.readdirSync(finalUploadsDir);
        let totalSize = 0;
        files.forEach(file => {
          try {
            const filePath = path.join(finalUploadsDir, file);
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
          } catch (error) {
            // Skip files that can't be read
          }
        });
        
        console.log(`📊 Storage usage: ${files.length} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      }
    } catch (error) {
      console.error('❌ Periodic cleanup error:', error.message);
    }
  }, 60 * 60 * 1000); // Run every hour
  
  // Clear interval on process exit
  process.on('exit', () => {
    clearInterval(cleanupInterval);
  });
  
  process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
    process.exit();
  });
  
  process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
    process.exit();
  });
  
  console.log('✅ Periodic cleanup service started (runs every hour, keeps files for 24h)');
};

// Get upload statistics
const getUploadStats = () => {
  try {
    if (!fs.existsSync(finalUploadsDir)) {
      return {
        directory: finalUploadsDir,
        exists: false,
        files: 0,
        totalSize: 0
      };
    }
    
    const files = fs.readdirSync(finalUploadsDir);
    let totalSize = 0;
    const fileTypes = {};
    
    files.forEach(file => {
      try {
        const filePath = path.join(finalUploadsDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        const ext = path.extname(file).toLowerCase();
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      } catch (error) {
        // Skip files that can't be read
      }
    });
    
    return {
      directory: finalUploadsDir,
      exists: true,
      files: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      fileTypes: fileTypes,
      maxAgeHours: 24
    };
  } catch (error) {
    return {
      directory: finalUploadsDir,
      exists: false,
      error: error.message
    };
  }
};

module.exports = {
  uploadSingle,
  handleUploadErrors,
  deleteUploadedFile,
  cleanOldFiles,
  startPeriodicCleanup,
  getUploadStats,
  uploadsDir: finalUploadsDir
};
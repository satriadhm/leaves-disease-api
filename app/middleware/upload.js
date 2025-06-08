const multer = require('multer');
const path = require('path');
const fs = require('fs');

// FIXED: Enhanced uploads directory detection and creation
const getUploadsDirectory = () => {
  // Try multiple possible locations
  const possiblePaths = [
    path.join(__dirname, '../../uploads'),           // Development
    path.join(process.cwd(), 'uploads'),            // Railway/Production
    path.join('/tmp', 'uploads'),                   // Fallback for read-only filesystems
    path.join(__dirname, '../../../uploads')        // Alternative structure
  ];

  for (const dirPath of possiblePaths) {
    try {
      // Ensure directory exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Test write permissions
      const testFile = path.join(dirPath, '.write-test-' + Date.now());
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      console.log('✅ Using uploads directory:', dirPath);
      return dirPath;
    } catch (error) {
      console.log(`⚠️ Cannot use directory ${dirPath}:`, error.message);
      continue;
    }
  }
  
  // If all fail, create a temp directory
  const tempDir = path.join(require('os').tmpdir(), 'plant-disease-uploads');
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    console.log('📁 Using temporary uploads directory:', tempDir);
    return tempDir;
  } catch (error) {
    console.error('❌ Failed to create any uploads directory:', error);
    throw new Error('Cannot create uploads directory');
  }
};

const uploadsDir = getUploadsDirectory();

// FIXED: Enhanced storage configuration with better error handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      // Double-check directory exists and is writable
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Test write permission again
      const testFile = path.join(uploadsDir, '.temp-test-' + Date.now());
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      console.log(`📁 Upload destination confirmed: ${uploadsDir}`);
      cb(null, uploadsDir);
    } catch (error) {
      console.error('❌ Upload destination error:', error.message);
      cb(new Error(`Upload destination not writable: ${error.message}`), null);
    }
  },
  filename: function (req, file, cb) {
    try {
      // Generate unique filename with timestamp and random string
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = path.extname(file.originalname).toLowerCase();
      
      // Validate extension
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      if (!allowedExtensions.includes(extension)) {
        return cb(new Error(`Invalid file extension: ${extension}. Allowed: ${allowedExtensions.join(', ')}`));
      }
      
      // Create filename: plant-{timestamp}-{random}.{ext}
      const filename = `plant-${timestamp}-${randomString}${extension}`;
      
      console.log('📎 Generating filename:', {
        original: file.originalname,
        generated: filename,
        extension: extension,
        mimetype: file.mimetype
      });
      
      cb(null, filename);
    } catch (error) {
      console.error('❌ Filename generation error:', error.message);
      cb(new Error(`Failed to generate filename: ${error.message}`), null);
    }
  }
});

// FIXED: Enhanced file filter with better validation
const fileFilter = (req, file, cb) => {
  console.log('📎 File filter check:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
    size: file.size || 'unknown'
  });

  // Check MIME type
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png', 
    'image/webp'
  ];
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    console.log('❌ Invalid MIME type:', file.mimetype);
    return cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
  }
  
  // Check file extension
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    console.log('❌ Invalid file extension:', fileExtension);
    return cb(new Error(`Invalid file extension: ${fileExtension}. Allowed extensions: ${allowedExtensions.join(', ')}`), false);
  }
  
  // Check filename for dangerous characters
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    console.log('❌ Dangerous filename detected:', file.originalname);
    return cb(new Error('Invalid filename: contains dangerous characters'), false);
  }
  
  // Additional security checks
  if (!file.originalname || file.originalname.length > 255) {
    console.log('❌ Invalid filename length:', file.originalname?.length || 0);
    return cb(new Error('Invalid filename: too long or empty'), false);
  }
  
  console.log('✅ File passed all security checks');
  cb(null, true);
};

// FIXED: Enhanced multer configuration with better limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1,                  // Only 1 file at a time
    fieldSize: 10 * 1024 * 1024, // 10MB max field size
    fields: 10,                // Max 10 fields
    parts: 20                  // Max 20 parts
  },
  onError: function(err, next) {
    console.error('💥 Multer configuration error:', err.message);
    next(err);
  }
});

// FIXED: Enhanced upload single middleware with comprehensive error handling
const uploadSingle = (req, res, next) => {
  const uploadHandler = upload.single('image');
  
  uploadHandler(req, res, (err) => {
    if (err) {
      console.error('💥 Upload handler error:', err.message);
      return next(err);
    }
    
    if (!req.file) {
      console.log('⚠️ No file uploaded');
      return next(); // Continue without file - let the controller handle this
    }
    
    try {
      // FIXED: Enhanced file processing and validation
      const filePath = req.file.path;
      const filename = req.file.filename;
      
      // Verify file was actually saved
      if (!fs.existsSync(filePath)) {
        throw new Error('File was not saved to disk');
      }
      
      // Get actual file size and verify it matches uploaded size
      const actualStats = fs.statSync(filePath);
      const actualSize = actualStats.size;
      
      if (actualSize !== req.file.size) {
        console.error('❌ File size mismatch:', { 
          expected: req.file.size, 
          actual: actualSize 
        });
        deleteUploadedFile(filePath);
        throw new Error('File upload incomplete: size mismatch');
      }
      
      // FIXED: Generate proper URLs for accessing the image
      const baseUrl = req.protocol + '://' + req.get('host');
      const relativeUrl = `/uploads/${filename}`;
      const fullUrl = `${baseUrl}${relativeUrl}`;
      
      // Add comprehensive file information to request
      req.file.url = relativeUrl;           // Relative URL for API responses
      req.file.fullUrl = fullUrl;          // Full URL for external access
      req.file.storageType = 'local';      // Storage type indicator
      req.file.uploadTimestamp = new Date().toISOString();
      req.file.uploadsDirectory = uploadsDir;
      req.file.verified = true;            // Mark as verified
      
      // Railway-specific URL if deployed
      if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        req.file.railwayUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}${relativeUrl}`;
      }
      
      console.log('✅ File uploaded and verified successfully:', {
        filename: filename,
        originalname: req.file.originalname,
        size: actualSize,
        sizeFormatted: `${(actualSize / 1024).toFixed(2)} KB`,
        path: filePath,
        url: relativeUrl,
        fullUrl: fullUrl,
        mimetype: req.file.mimetype,
        storageType: req.file.storageType
      });
      
      // Additional verification: try to read file header to ensure it's valid
      try {
        const buffer = fs.readFileSync(filePath, { flag: 'r' });
        const header = buffer.slice(0, 10);
        
        // Basic image format validation by checking file headers
        let isValidImage = false;
        
        // PNG: 89 50 4E 47
        if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
          isValidImage = true;
          req.file.detectedFormat = 'PNG';
        }
        // JPEG: FF D8 FF
        else if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
          isValidImage = true;
          req.file.detectedFormat = 'JPEG';
        }
        // WebP: 52 49 46 46 ... 57 45 42 50
        else if (header.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
          isValidImage = true;
          req.file.detectedFormat = 'WebP';
        }
        
        if (!isValidImage) {
          console.error('❌ File header validation failed - not a valid image');
          deleteUploadedFile(filePath);
          throw new Error('Invalid image file: corrupted or wrong format');
        }
        
        console.log(`✅ Image format verified: ${req.file.detectedFormat}`);
        
      } catch (verificationError) {
        console.error('❌ File verification failed:', verificationError.message);
        deleteUploadedFile(filePath);
        throw new Error('File verification failed: ' + verificationError.message);
      }
      
    } catch (processingError) {
      console.error('❌ File processing error:', processingError.message);
      
      // Clean up file if processing failed
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        deleteUploadedFile(req.file.path);
      }
      
      return next(new Error('File processing failed: ' + processingError.message));
    }
    
    next();
  });
};

// FIXED: Enhanced error handling with detailed error messages
const handleUploadErrors = (err, req, res, next) => {
  console.error('🚨 Upload error handler triggered:', err.message);
  
  // Clean up any uploaded file if error occurred
  if (req.file && req.file.path && fs.existsSync(req.file.path)) {
    console.log('🧹 Cleaning up file due to error:', req.file.path);
    deleteUploadedFile(req.file.path);
  }
  
  // Handle Multer-specific errors
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB.',
          error: 'FILE_TOO_LARGE',
          maxSize: '5MB',
          limits: {
            fileSize: '5MB',
            allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
          }
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
          error: 'MULTER_ERROR',
          code: err.code
        });
    }
  }
  
  // Handle custom validation errors
  if (err && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      error: 'INVALID_FILE_TYPE',
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp']
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
  
  if (err && err.message.includes('Invalid filename')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      error: 'INVALID_FILENAME'
    });
  }
  
  // Handle system errors
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
  
  if (err && err.message.includes('Upload destination not writable')) {
    return res.status(500).json({
      success: false,
      message: 'Server storage configuration error.',
      error: 'STORAGE_CONFIG_ERROR'
    });
  }
  
  if (err && err.message.includes('File verification failed')) {
    return res.status(400).json({
      success: false,
      message: 'File appears to be corrupted or invalid.',
      error: 'FILE_VERIFICATION_FAILED'
    });
  }
  
  // Generic error handler
  if (err) {
    return res.status(400).json({
      success: false,
      message: 'File upload failed: ' + err.message,
      error: 'UPLOAD_FAILED',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
  
  next(err);
};

// FIXED: Enhanced file deletion with better error handling
const deleteUploadedFile = (filePath) => {
  try {
    if (!filePath) {
      console.log('⚠️ No file path provided for deletion');
      return false;
    }
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted file: ${path.basename(filePath)} (${(stats.size / 1024).toFixed(2)} KB)`);
      return true;
    } else {
      console.log(`⚠️ File not found for deletion: ${path.basename(filePath)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error deleting file ${path.basename(filePath)}:`, error.message);
    return false;
  }
};

// FIXED: Enhanced cleanup function with better statistics
const cleanOldFiles = (maxAgeHours = 24) => {
  try {
    if (!fs.existsSync(uploadsDir)) {
      console.log('⚠️ Uploads directory does not exist for cleanup');
      return {
        deleted: 0,
        total: 0,
        errors: 0,
        totalSize: 0,
        freedSpace: 0
      };
    }
    
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    
    let deletedCount = 0;
    let totalFiles = 0;
    let errors = 0;
    let totalSize = 0;
    let freedSpace = 0;
    
    console.log(`🧹 Starting cleanup: checking ${files.length} files (max age: ${maxAgeHours}h)`);
    
    files.forEach(file => {
      try {
        // Skip hidden files and directories
        if (file.startsWith('.') || file === 'README.md') {
          return;
        }
        
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        
        // Skip directories
        if (stats.isDirectory()) {
          return;
        }
        
        totalFiles++;
        totalSize += stats.size;
        
        const age = now - stats.mtime.getTime();
        const ageHours = age / (1000 * 60 * 60);
        
        if (age > maxAge) {
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
          freedSpace += fileSize;
          console.log(`🗑️ Cleaned old file: ${file} (age: ${ageHours.toFixed(1)}h, size: ${(fileSize / 1024).toFixed(2)} KB)`);
        }
      } catch (fileError) {
        errors++;
        console.error(`❌ Error processing file ${file}:`, fileError.message);
      }
    });
    
    const result = {
      deleted: deletedCount,
      total: totalFiles,
      errors: errors,
      totalSize: totalSize,
      freedSpace: freedSpace
    };
    
    if (deletedCount > 0 || errors > 0) {
      console.log(`✅ Cleanup completed: ${deletedCount}/${totalFiles} files deleted, ${(freedSpace / 1024).toFixed(2)} KB freed, ${errors} errors`);
    } else {
      console.log(`✅ Cleanup completed: No old files found (${totalFiles} files checked)`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error during file cleanup:', error.message);
    return {
      deleted: 0,
      total: 0,
      errors: 1,
      totalSize: 0,
      freedSpace: 0,
      error: error.message
    };
  }
};

const startPeriodicCleanup = () => {
  console.log('🧹 Starting periodic file cleanup service...');
  
  setTimeout(() => {
    console.log('🧹 Running initial cleanup...');
    cleanOldFiles(24);
  }, 30000);
  
  const cleanupInterval = setInterval(() => {
    try {
      console.log('🧹 Running scheduled cleanup...');
      const result = cleanOldFiles(24);
      
      // Log storage statistics
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        const validFiles = files.filter(f => !f.startsWith('.'));
        
        let totalSize = 0;
        validFiles.forEach(file => {
          try {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              totalSize += stats.size;
            }
          } catch (error) {
            // Skip files that can't be read
          }
        });
        
        console.log(`📊 Storage status: ${validFiles.length} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB used`);
        
        // Warn if storage is getting large
        if (totalSize > 100 * 1024 * 1024) { // 100MB
          console.log('⚠️ Storage usage is high, consider adjusting cleanup frequency');
        }
      }
    } catch (error) {
      console.error('❌ Periodic cleanup error:', error.message);
    }
  }, 60 * 60 * 1000); // Every hour
  
  // Cleanup on process exit
  const cleanup = () => {
    console.log('🧹 Process termination cleanup...');
    clearInterval(cleanupInterval);
  };
  
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGUSR1', cleanup);
  process.on('SIGUSR2', cleanup);
  
  console.log('✅ Periodic cleanup service started (runs every hour, keeps files for 24h)');
  return cleanupInterval;
};

// FIXED: Enhanced upload statistics function
const getUploadStats = () => {
  try {
    if (!fs.existsSync(uploadsDir)) {
      return {
        directory: uploadsDir,
        exists: false,
        files: 0,
        totalSize: 0,
        error: 'Directory does not exist'
      };
    }
    
    const files = fs.readdirSync(uploadsDir);
    let totalSize = 0;
    let validFiles = 0;
    const fileTypes = {};
    const recentFiles = [];
    const errors = [];
    
    files.forEach(file => {
      try {
        if (file.startsWith('.')) return; // Skip hidden files
        
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          validFiles++;
          totalSize += stats.size;
          
          const ext = path.extname(file).toLowerCase();
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;
          
          recentFiles.push({
            name: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            url: `/uploads/${file}`
          });
        }
      } catch (error) {
        errors.push(`${file}: ${error.message}`);
      }
    });
    
    // Sort recent files by creation time
    recentFiles.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    return {
      directory: uploadsDir,
      exists: true,
      files: validFiles,
      totalFiles: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      fileTypes: fileTypes,
      recentFiles: recentFiles.slice(0, 10),
      errors: errors,
      maxAgeHours: 24,
      storageHealth: totalSize < 100 * 1024 * 1024 ? 'good' : 'high'
    };
  } catch (error) {
    return {
      directory: uploadsDir,
      exists: false,
      error: error.message,
      files: 0,
      totalSize: 0
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
  uploadsDir
};
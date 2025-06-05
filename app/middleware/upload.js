const multer = require('multer');
const { put } = require('@vercel/blob');

// Memory storage untuk Vercel Blob
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
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

// Middleware untuk upload ke Vercel Blob
const uploadToBlob = async (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = req.file.originalname.split('.').pop().toLowerCase();
    const filename = `plant-${uniqueSuffix}.${extension}`;

    // Upload to Vercel Blob
    const blob = await put(filename, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // Add blob info to request
    req.blob = {
      url: blob.url,
      filename: filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    };

    next();
  } catch (error) {
    console.error('Blob upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload image to storage',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Storage error'
    });
  }
};

// Middleware untuk single file upload
const uploadSingle = [
  upload.single('image'),
  uploadToBlob
];

// Error handling middleware
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file is allowed.'
      });
    }
  }
  
  if (err && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next(err);
};

module.exports = {
  uploadSingle,
  handleUploadErrors
};
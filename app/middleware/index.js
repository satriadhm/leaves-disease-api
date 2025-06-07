const authJwt = require("./authJwt");
const verifySignUp = require("./verifySignUp");
const { optionalAuth } = require("./optionalAuth");
const { 
  uploadSingle, 
  handleUploadErrors, 
  deleteUploadedFile,
  cleanOldFiles,
  startPeriodicCleanup,
  uploadsDir 
} = require("./upload");

module.exports = {
    authJwt,
    verifySignUp,
    optionalAuth,
    uploadSingle,
    handleUploadErrors,
    deleteUploadedFile,
    cleanOldFiles,
    startPeriodicCleanup,
    uploadsDir
};
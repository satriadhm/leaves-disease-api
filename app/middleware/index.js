// app/middleware/index.js
const authJwt = require("./authJwt");
const verifySignUp = require("./verifySignUp");
const { optionalAuth } = require("./optionalAuth");
const { uploadSingle, handleUploadErrors } = require("./upload");

module.exports = {
    authJwt,
    verifySignUp,
    optionalAuth,
    uploadSingle,
    handleUploadErrors
};
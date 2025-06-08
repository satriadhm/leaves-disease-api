const { authJwt, optionalAuth, uploadSingle, handleUploadErrors } = require("../middleware");
const controller = require("../controllers/prediction.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  // Health check endpoint untuk model (public)
  app.get("/api/model/health", controller.getModelHealth);

  // Create prediction (dapat diakses tanpa login)
  app.post(
    "/api/predict",
    [optionalAuth, uploadSingle, handleUploadErrors],
    controller.predictPlantDisease
  );

  // Get prediction history (butuh login)
  app.get(
    "/api/predictions/history",
    [authJwt.verifyToken],
    controller.getPredictionHistory
  );

  // Get prediction detail by ID (butuh login)
  app.get(
    "/api/predictions/:id",
    [authJwt.verifyToken],
    controller.getPredictionDetail
  );

  // Delete prediction by ID (butuh login)
  app.delete(
    "/api/predictions/:id",
    [authJwt.verifyToken],
    controller.deletePrediction
  );

  // Admin routes
  // Get all predictions (admin only)
  app.get(
    "/api/admin/predictions",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.getAllPredictions
  );

  // Get prediction statistics (admin only)
  app.get(
    "/api/predictions/stats",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.getPredictionStats
  );

  // Delete any prediction (admin only)
  app.delete(
    "/api/admin/predictions/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.adminDeletePrediction
  );
};
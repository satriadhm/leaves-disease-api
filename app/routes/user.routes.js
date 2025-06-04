// app/routes/user.routes.js
const { authJwt } = require("../middleware");
const controller = require("../controllers/user.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  // Public routes
  app.get("/api/test/all", controller.allAccess);

  // Protected user routes
  app.get("/api/test/user", [authJwt.verifyToken], controller.userBoard);

  // User profile management
  app.get(
    "/api/user/profile",
    [authJwt.verifyToken],
    controller.getProfile
  );

  app.put(
    "/api/user/profile",
    [authJwt.verifyToken],
    controller.updateProfile
  );

  app.delete(
    "/api/user/account",
    [authJwt.verifyToken],
    controller.deleteAccount
  );

  // Moderator routes
  app.get(
    "/api/test/mod", 
    [authJwt.verifyToken, authJwt.isModerator], 
    controller.moderatorBoard
  );

  // Admin routes
  app.get(
    "/api/test/admin",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.adminBoard
  );

  // Admin: User management
  app.get(
    "/api/admin/users",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.getAllUsers
  );

  app.get(
    "/api/admin/users/stats",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.getUserStats
  );

  app.get(
    "/api/admin/users/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.getUserById
  );

  app.put(
    "/api/admin/users/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.updateUser
  );

  app.delete(
    "/api/admin/users/:id",
    [authJwt.verifyToken, authJwt.isAdmin],
    controller.deleteUser
  );
};
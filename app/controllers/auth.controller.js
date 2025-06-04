// app/controllers/auth.controller.js
const config = require("../config/auth.config");
const db = require("../models");
const User = db.user;
const Role = db.role;
const BlacklistedToken = db.blacklistedToken;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports.signup = async (req, res) => {
  try {
    // Validasi input
    if (!req.body.username || !req.body.email || !req.body.password) {
      return res.status(400).send({
        message: "Username, email, and password are required!"
      });
    }

    // Validasi password strength
    if (req.body.password.length < 6) {
      return res.status(400).send({
        message: "Password must be at least 6 characters long!"
      });
    }

    // Cek apakah role collection sudah ada
    const roleCount = await Role.countDocuments();
    if (roleCount === 0) {
      console.log("No roles found in database. Creating default role...");
      const defaultRole = new Role({ name: "user" });
      await defaultRole.save();
      console.log("Default 'user' role created");
    }

    const user = new User({
      username: req.body.username,
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, 8),
      profile: {
        firstName: req.body.firstName || '',
        lastName: req.body.lastName || '',
        phone: req.body.phone || '',
        dateOfBirth: req.body.dateOfBirth || null,
        address: req.body.address || ''
      }
    });

    const savedUser = await user.save();

    if (!savedUser || !savedUser._id) {
      throw new Error("Failed to save user to database");
    }

    if (req.body.roles && req.body.roles.length > 0) {
      const roles = await Role.find({
        name: { $in: req.body.roles }
      });

      if (roles.length === 0) {
        console.log("No matching roles found, assigning default user role");
        const defaultRole = await Role.findOne({ name: "user" });
        savedUser.roles = [defaultRole._id];
      } else {
        savedUser.roles = roles.map(role => role._id);
      }
    } else {
      const defaultRole = await Role.findOne({ name: "user" });
      if (!defaultRole) {
        throw new Error("Default user role not found");
      }
      savedUser.roles = [defaultRole._id];
    }

    await savedUser.save();

    res.status(200).send({ 
      message: "User was registered successfully!",
      userId: savedUser._id 
    });

  } catch (err) {
    console.error("Signup error:", err);
    
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).send({
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists!`
      });
    }

    res.status(500).send({ 
      message: err.message || "An error occurred while registering the user."
    });
  }
};

exports.signin = async (req, res) => {
  try {
    if (!req.body.username || !req.body.password) {
      return res.status(400).send({
        message: "Username and password are required!"
      });
    }

    const user = await User.findOne({
      username: req.body.username
    }).populate("roles", "-__v");

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    // Check if user is active
    if (user.status === 'inactive') {
      return res.status(403).send({ message: "Account is deactivated. Contact administrator." });
    }

    var passwordIsValid = bcrypt.compareSync(
      req.body.password,
      user.password
    );

    if (!passwordIsValid) {
      return res.status(401).send({
        accessToken: null,
        message: "Invalid Password!"
      });
    }

    var token = jwt.sign({ id: user.id }, config.secret, {
      expiresIn: 86400 // 24 hours
    });

    var authorities = [];
    for (let i = 0; i < user.roles.length; i++) {
      authorities.push("ROLE_" + user.roles[i].name.toUpperCase());
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(200).send({
      id: user._id,
      username: user.username,
      email: user.email,
      profile: user.profile,
      roles: authorities,
      accessToken: token,
      lastLogin: user.lastLogin
    });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).send({ 
      message: err.message || "An error occurred while signing in."
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.headers["x-access-token"];
    
    if (!token) {
      return res.status(400).send({ message: "No token provided!" });
    }

    // Add token to blacklist
    const blacklistedToken = new BlacklistedToken({
      token: token,
      userId: req.userId,
      expiresAt: new Date(Date.now() + 86400 * 1000) // 24 hours
    });

    await blacklistedToken.save();

    res.status(200).send({ message: "Logged out successfully!" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).send({ 
      message: err.message || "An error occurred while logging out."
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).send({ message: "Refresh token is required!" });
    }

    // Verify refresh token
    jwt.verify(refreshToken, config.refreshSecret, async (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "Invalid refresh token!" });
      }

      const user = await User.findById(decoded.id).populate("roles", "-__v");
      if (!user) {
        return res.status(404).send({ message: "User not found!" });
      }

      // Generate new access token
      const newAccessToken = jwt.sign({ id: user.id }, config.secret, {
        expiresIn: 86400 // 24 hours
      });

      var authorities = [];
      for (let i = 0; i < user.roles.length; i++) {
        authorities.push("ROLE_" + user.roles[i].name.toUpperCase());
      }

      res.status(200).send({
        id: user._id,
        username: user.username,
        email: user.email,
        roles: authorities,
        accessToken: newAccessToken
      });
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).send({ 
      message: err.message || "An error occurred while refreshing token."
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).send({ message: "Email is required!" });
    }

    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).send({ message: "User with this email not found!" });
    }

    // Generate reset token
    const resetToken = jwt.sign({ id: user.id }, config.secret, {
      expiresIn: 3600 // 1 hour
    });

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // In a real application, you would send an email here
    // For now, we'll just return the token (NOT recommended for production)
    res.status(200).send({ 
      message: "Password reset token generated successfully!",
      resetToken: resetToken // Remove this in production
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).send({ 
      message: err.message || "An error occurred while processing forgot password."
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    
    if (!resetToken || !newPassword) {
      return res.status(400).send({ message: "Reset token and new password are required!" });
    }

    if (newPassword.length < 6) {
      return res.status(400).send({ message: "Password must be at least 6 characters long!" });
    }

    // Verify reset token
    jwt.verify(resetToken, config.secret, async (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "Invalid or expired reset token!" });
      }

      const user = await User.findById(decoded.id);
      if (!user || user.resetPasswordToken !== resetToken) {
        return res.status(401).send({ message: "Invalid reset token!" });
      }

      if (user.resetPasswordExpires < new Date()) {
        return res.status(401).send({ message: "Reset token has expired!" });
      }

      // Update password
      user.password = bcrypt.hashSync(newPassword, 8);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.status(200).send({ message: "Password reset successfully!" });
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).send({ 
      message: err.message || "An error occurred while resetting password."
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).send({ message: "Current password and new password are required!" });
    }

    if (newPassword.length < 6) {
      return res.status(400).send({ message: "New password must be at least 6 characters long!" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found!" });
    }

    // Verify current password
    const passwordIsValid = bcrypt.compareSync(currentPassword, user.password);
    if (!passwordIsValid) {
      return res.status(401).send({ message: "Current password is incorrect!" });
    }

    // Update password
    user.password = bcrypt.hashSync(newPassword, 8);
    await user.save();

    res.status(200).send({ message: "Password changed successfully!" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).send({ 
      message: err.message || "An error occurred while changing password."
    });
  }
};
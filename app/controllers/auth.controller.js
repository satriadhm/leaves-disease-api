// app/controllers/auth.controller.js - FIXED VERSION
const config = require("../config/auth.config");
const db = require("../models");
const User = db.user;
const Role = db.role;
const BlacklistedToken = db.blacklistedToken;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

// Cache untuk default role agar tidak perlu query database setiap kali
let defaultRoleCache = null;

// Helper function untuk mendapatkan atau membuat default role
const getDefaultRole = async () => {
  try {
    // Gunakan cache jika tersedia
    if (defaultRoleCache) {
      return defaultRoleCache;
    }

    // Coba cari role 'user' dengan timeout
    let userRole = await Role.findOne({ name: "user" })
      .maxTimeMS(5000) // 5 second timeout
      .lean(); // Lebih cepat karena tidak perlu full mongoose document

    // Jika tidak ada, buat role baru
    if (!userRole) {
      console.log("📝 Creating default 'user' role...");
      userRole = await new Role({ name: "user" }).save();
      console.log("✅ Default 'user' role created");
    }

    // Cache role untuk penggunaan berikutnya
    defaultRoleCache = userRole;
    return userRole;

  } catch (error) {
    console.error("❌ Error getting default role:", error.message);
    throw new Error("Failed to initialize user role");
  }
};

// Helper function untuk validasi input signup
const validateSignupInput = (body) => {
  const errors = [];

  if (!body.username || body.username.trim().length < 3) {
    errors.push("Username must be at least 3 characters long");
  }

  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push("Valid email is required");
  }

  if (!body.password || body.password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }

  // Username format validation
  if (body.username && !/^[a-zA-Z0-9_]+$/.test(body.username)) {
    errors.push("Username can only contain letters, numbers, and underscores");
  }

  return errors;
};

// Helper function untuk check duplicate dengan timeout
const checkDuplicateUser = async (username, email) => {
  try {
    const [existingUsername, existingEmail] = await Promise.all([
      User.findOne({ username: username.trim() })
        .maxTimeMS(5000)
        .lean()
        .select('_id'),
      User.findOne({ email: email.trim().toLowerCase() })
        .maxTimeMS(5000)
        .lean()
        .select('_id')
    ]);

    if (existingUsername) {
      throw new Error("Username already exists!");
    }

    if (existingEmail) {
      throw new Error("Email already exists!");
    }

    return true;
  } catch (error) {
    if (error.message.includes("already exists")) {
      throw error;
    }
    console.error("❌ Database check error:", error.message);
    throw new Error("Database connection error. Please try again.");
  }
};

exports.signup = async (req, res) => {
  try {
    console.log("🚀 Signup request received for:", req.body.username);

    // 1. Validasi input awal
    const validationErrors = validateSignupInput(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    const { username, email, password, firstName, lastName, phone, dateOfBirth, address } = req.body;

    // 2. Check duplicate users dengan timeout protection
    console.log("🔍 Checking for duplicate users...");
    await checkDuplicateUser(username, email);
    console.log("✅ No duplicate users found");

    // 3. Get atau create default role dengan timeout protection
    console.log("🎭 Getting default user role...");
    const defaultRole = await getDefaultRole();
    console.log("✅ Default role obtained:", defaultRole.name);

    // 4. Hash password
    console.log("🔒 Hashing password...");
    const hashedPassword = bcrypt.hashSync(password, 8);

    // 5. Create user object
    const newUser = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      roles: [defaultRole._id],
      profile: {
        firstName: firstName ? firstName.trim() : '',
        lastName: lastName ? lastName.trim() : '',
        phone: phone ? phone.trim() : '',
        dateOfBirth: dateOfBirth || null,
        address: address ? address.trim() : ''
      },
      status: 'active'
    });

    // 6. Save user dengan timeout protection
    console.log("💾 Saving new user to database...");
    const savedUser = await Promise.race([
      newUser.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database save timeout')), 10000)
      )
    ]);

    if (!savedUser || !savedUser._id) {
      throw new Error("Failed to save user to database");
    }

    console.log("✅ User created successfully:", savedUser.username);

    // 7. Handle role assignment jika ada roles khusus di request
    if (req.body.roles && Array.isArray(req.body.roles) && req.body.roles.length > 0) {
      try {
        console.log("🎯 Assigning custom roles:", req.body.roles);
        const customRoles = await Role.find({
          name: { $in: req.body.roles }
        }).maxTimeMS(5000);

        if (customRoles.length > 0) {
          savedUser.roles = customRoles.map(role => role._id);
          await savedUser.save();
          console.log("✅ Custom roles assigned");
        }
      } catch (roleError) {
        console.warn("⚠️ Custom role assignment failed:", roleError.message);
        // Continue with default role - don't fail the registration
      }
    }

    // 8. Success response
    res.status(200).json({ 
      success: true,
      message: "User was registered successfully!",
      data: {
        userId: savedUser._id,
        username: savedUser.username,
        email: savedUser.email
      }
    });

    console.log("🎉 Signup completed successfully for:", username);

  } catch (err) {
    console.error("❌ Signup error for user:", req.body.username, "Error:", err.message);
    
    // Enhanced error handling
    let statusCode = 500;
    let errorMessage = "An error occurred while registering the user.";

    if (err.code === 11000) {
      // MongoDB duplicate key error
      statusCode = 400;
      const field = Object.keys(err.keyPattern)[0];
      errorMessage = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists!`;
    } else if (err.message.includes("already exists")) {
      statusCode = 400;
      errorMessage = err.message;
    } else if (err.message.includes("timeout") || err.message.includes("buffering")) {
      statusCode = 503;
      errorMessage = "Database connection timeout. Please try again.";
    } else if (err.message.includes("Database connection error")) {
      statusCode = 503;
      errorMessage = err.message;
    } else if (err.message.includes("ValidationError") || err.message.includes("validation")) {
      statusCode = 400;
      errorMessage = "Invalid input data provided.";
    } else if (err.message.includes("Failed to initialize user role")) {
      statusCode = 503;
      errorMessage = "Service temporarily unavailable. Please try again.";
    }

    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

exports.signin = async (req, res) => {
  try {
    console.log("🔐 Signin request received for:", req.body.username);

    // Validasi input
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required!"
      });
    }

    // Find user dengan timeout dan populate roles
    const user = await User.findOne({
      username: req.body.username.trim()
    })
    .populate("roles", "-__v")
    .maxTimeMS(5000); // 5 second timeout

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found." 
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false,
        message: "Account is deactivated. Contact administrator." 
      });
    }

    // Verify password
    const passwordIsValid = bcrypt.compareSync(
      req.body.password,
      user.password
    );

    if (!passwordIsValid) {
      return res.status(401).json({
        success: false,
        accessToken: null,
        message: "Invalid Password!"
      });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id }, config.secret, {
      expiresIn: 86400 // 24 hours
    });

    // Prepare role authorities
    const authorities = user.roles.map(role => 
      "ROLE_" + role.name.toUpperCase()
    );

    // Update last login dengan timeout protection
    try {
      user.lastLogin = new Date();
      await Promise.race([
        user.save(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Save timeout')), 5000)
        )
      ]);
    } catch (updateError) {
      console.warn("⚠️ Failed to update last login:", updateError.message);
      // Continue with login - don't fail for this
    }

    console.log("✅ Signin successful for:", user.username);

    res.status(200).json({
      success: true,
      id: user._id,
      username: user.username,
      email: user.email,
      profile: user.profile,
      roles: authorities,
      accessToken: token,
      lastLogin: user.lastLogin
    });

  } catch (err) {
    console.error("❌ Signin error:", err.message);
    
    let statusCode = 500;
    let errorMessage = "An error occurred while signing in.";

    if (err.message.includes("timeout") || err.message.includes("buffering")) {
      statusCode = 503;
      errorMessage = "Database connection timeout. Please try again.";
    }

    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.headers["x-access-token"];
    
    if (!token) {
      return res.status(400).json({ 
        success: false,
        message: "No token provided!" 
      });
    }

    // Add token to blacklist dengan timeout protection
    const blacklistedToken = new BlacklistedToken({
      token: token,
      userId: req.userId,
      expiresAt: new Date(Date.now() + 86400 * 1000) // 24 hours
    });

    await Promise.race([
      blacklistedToken.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Blacklist timeout')), 5000)
      )
    ]);

    res.status(200).json({ 
      success: true,
      message: "Logged out successfully!" 
    });

  } catch (err) {
    console.error("❌ Logout error:", err.message);
    
    // Even if blacklisting fails, consider logout successful on client side
    res.status(200).json({ 
      success: true,
      message: "Logged out successfully!" 
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false,
        message: "Refresh token is required!" 
      });
    }

    // Verify refresh token
    jwt.verify(refreshToken, config.refreshSecret || config.secret, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid refresh token!" 
        });
      }

      try {
        const user = await User.findById(decoded.id)
          .populate("roles", "-__v")
          .maxTimeMS(5000);

        if (!user) {
          return res.status(404).json({ 
            success: false,
            message: "User not found!" 
          });
        }

        if (user.status !== 'active') {
          return res.status(403).json({ 
            success: false,
            message: "Account is not active!" 
          });
        }

        // Generate new access token
        const newAccessToken = jwt.sign({ id: user.id }, config.secret, {
          expiresIn: 86400 // 24 hours
        });

        const authorities = user.roles.map(role => 
          "ROLE_" + role.name.toUpperCase()
        );

        res.status(200).json({
          success: true,
          id: user._id,
          username: user.username,
          email: user.email,
          roles: authorities,
          accessToken: newAccessToken
        });

      } catch (userError) {
        console.error("❌ User lookup error:", userError.message);
        res.status(503).json({ 
          success: false,
          message: "Service temporarily unavailable." 
        });
      }
    });

  } catch (err) {
    console.error("❌ Refresh token error:", err.message);
    res.status(500).json({ 
      success: false,
      message: "An error occurred while refreshing token." 
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: "Email is required!" 
      });
    }

    const user = await User.findOne({ 
      email: email.trim().toLowerCase() 
    }).maxTimeMS(5000);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User with this email not found!" 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign({ id: user.id }, config.secret, {
      expiresIn: 3600 // 1 hour
    });

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour

    await Promise.race([
      user.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);

    // In a real application, you would send an email here
    res.status(200).json({ 
      success: true,
      message: "Password reset token generated successfully!",
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });

  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    res.status(500).json({ 
      success: false,
      message: "An error occurred while processing forgot password." 
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    
    if (!resetToken || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: "Reset token and new password are required!" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: "Password must be at least 6 characters long!" 
      });
    }

    // Verify reset token
    jwt.verify(resetToken, config.secret, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired reset token!" 
        });
      }

      try {
        const user = await User.findById(decoded.id).maxTimeMS(5000);
        
        if (!user || user.resetPasswordToken !== resetToken) {
          return res.status(401).json({ 
            success: false,
            message: "Invalid reset token!" 
          });
        }

        if (user.resetPasswordExpires < new Date()) {
          return res.status(401).json({ 
            success: false,
            message: "Reset token has expired!" 
          });
        }

        // Update password
        user.password = bcrypt.hashSync(newPassword, 8);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await Promise.race([
          user.save(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Save timeout')), 5000)
          )
        ]);

        res.status(200).json({ 
          success: true,
          message: "Password reset successfully!" 
        });

      } catch (userError) {
        console.error("❌ Reset password user error:", userError.message);
        res.status(503).json({ 
          success: false,
          message: "Service temporarily unavailable." 
        });
      }
    });

  } catch (err) {
    console.error("❌ Reset password error:", err.message);
    res.status(500).json({ 
      success: false,
      message: "An error occurred while resetting password." 
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: "Current password and new password are required!" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: "New password must be at least 6 characters long!" 
      });
    }

    const user = await User.findById(req.userId).maxTimeMS(5000);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found!" 
      });
    }

    // Verify current password
    const passwordIsValid = bcrypt.compareSync(currentPassword, user.password);
    if (!passwordIsValid) {
      return res.status(401).json({ 
        success: false,
        message: "Current password is incorrect!" 
      });
    }

    // Update password
    user.password = bcrypt.hashSync(newPassword, 8);
    
    await Promise.race([
      user.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);

    res.status(200).json({ 
      success: true,
      message: "Password changed successfully!" 
    });

  } catch (err) {
    console.error("❌ Change password error:", err.message);
    res.status(500).json({ 
      success: false,
      message: "An error occurred while changing password." 
    });
  }
};
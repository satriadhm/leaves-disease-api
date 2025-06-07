const jwt = require('jsonwebtoken');
const config = require('../config/auth.config.js');
const db = require('../models');
const User = db.user;
const Role = db.role;
const BlacklistedToken = db.blacklistedToken;

verifyToken = async (req, res, next) => {
    let token = req.headers["x-access-token"];
    
    if (!token) {
        return res.status(403).send({ message: "No token provided!" });
    }
    
    try {
        const blacklistedToken = await BlacklistedToken.isBlacklisted(token);
        if (blacklistedToken) {
            return res.status(401).send({ message: "Token has been invalidated!" });
        }
        
        jwt.verify(token, config.secret, async (err, decoded) => {
            if (err) {
                return res.status(401).send({ message: "Unauthorized!" });
            }
            
            const user = await User.findById(decoded.id);
            if (!user) {
                return res.status(401).send({ message: "User not found!" });
            }
            
            if (user.status !== 'active') {
                return res.status(403).send({ message: "Account is not active!" });
            }
            
            req.userId = decoded.id;
            next();
        });
    } catch (error) {
        console.error("Token verification error:", error);
        return res.status(500).send({ message: "Internal server error during authentication" });
    }
};

isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(500).send({ message: "User not found!" });
        }
        
        const roles = await Role.find({
            _id: { $in: user.roles }
        });
        
        for (let i = 0; i < roles.length; i++) {
            if (roles[i].name === "admin") {
                next();
                return;
            }
        }
        
        res.status(403).send({ message: "Require Admin Role!" });
    } catch (err) {
        res.status(500).send({ message: err.message });
    }
};

isModerator = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(500).send({ message: "User not found!" });
        }
        
        const roles = await Role.find({
            _id: { $in: user.roles }
        });
        
        for (let i = 0; i < roles.length; i++) {
            if (roles[i].name === "moderator") {
                next();
                return;
            }
        }
        
        res.status(403).send({ message: "Require Moderator Role!" });
    } catch (err) {
        res.status(500).send({ message: err.message });
    }
};

isModeratorOrAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(500).send({ message: "User not found!" });
        }
        
        const roles = await Role.find({
            _id: { $in: user.roles }
        });
        
        for (let i = 0; i < roles.length; i++) {
            if (roles[i].name === "moderator" || roles[i].name === "admin") {
                next();
                return;
            }
        }
        
        res.status(403).send({ message: "Require Moderator or Admin Role!" });
    } catch (err) {
        res.status(500).send({ message: err.message });
    }
};

checkOwnership = (req, res, next) => {
    const resourceUserId = req.params.userId || req.body.userId;
    
    if (req.userId === resourceUserId) {
        next();
        return;
    }
    
    // Check if user is admin
    isAdmin(req, res, next);
};

const authJwt = {
    verifyToken,
    isAdmin,
    isModerator,
    isModeratorOrAdmin,
    checkOwnership
};

module.exports = authJwt;
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }
    
    // Check if token starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Invalid token format. Use Bearer token.' 
      });
    }
    
    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. Token is empty.' 
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by ID from token
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Token is valid but user no longer exists.' 
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'User account is deactivated.' 
      });
    }
    
    // Add user to request object
    req.user = user;
    req.userId = user._id;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired. Please login again.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Token verification failed.' 
    });
  }
};

// Middleware to verify admin role
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required for admin access.' 
      });
    }
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ 
      error: 'Admin verification failed.' 
    });
  }
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
      return next(); // Continue without user
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user && user.isActive) {
      req.user = user;
      req.userId = user._id;
    }
    
    next();
  } catch (error) {
    // Don't fail, just continue without user
    next();
  }
};

// Middleware to check if user owns resource
const ownershipMiddleware = (modelName, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceModel = require(`../models/${modelName}`);
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({ 
          error: 'Resource not found.' 
        });
      }
      
      // Check if user owns the resource or is admin
      if (resource.uploadedBy && 
          resource.uploadedBy.toString() !== req.userId.toString() && 
          req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. You can only access your own resources.' 
        });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership middleware error:', error);
      res.status(500).json({ 
        error: 'Ownership verification failed.' 
      });
    }
  };
};

// Rate limiting for sensitive operations
const createRateLimit = (windowMs, max, message) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests
    skipSuccessfulRequests: true,
    // Custom key generator (use IP + user ID if available)
    keyGenerator: (req) => {
      return req.userId ? `${req.ip}:${req.userId}` : req.ip;
    }
  });
};

// Pre-defined rate limits
const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts. Please try again later.'
);

const uploadRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  10, // 10 uploads
  'Too many uploads. Please try again later.'
);

module.exports = {
  authMiddleware,
  adminMiddleware,
  optionalAuthMiddleware,
  ownershipMiddleware,
  authRateLimit,
  uploadRateLimit
};
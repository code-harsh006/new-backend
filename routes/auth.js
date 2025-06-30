const express = require('express');
const router = express.Router();

// Import controllers
const { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  changePassword, 
  refreshToken, 
  logout, 
  deactivateAccount 
} = require('../controllers/authController');

// Import middleware
const { authMiddleware, authRateLimit } = require('../middleware/authMiddleware');

// Apply rate limiting to auth routes
router.use(authRateLimit);

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', register);

// @route   POST /api/auth/login
// @desc    Login user and return JWT token
// @access  Public
router.post('/login', login);

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', authMiddleware, getProfile);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authMiddleware, updateProfile);

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', authMiddleware, changePassword);

// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh', authMiddleware, refreshToken);

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authMiddleware, logout);

// @route   POST /api/auth/deactivate
// @desc    Deactivate user account
// @access  Private
router.post('/deactivate', authMiddleware, deactivateAccount);

module.exports = router;
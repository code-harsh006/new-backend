const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET, 
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'vibe-loop',
      audience: 'vibe-loop-users'
    }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;
    
    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'Username, email, and password are required.' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username }
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email.toLowerCase() 
          ? 'Email already registered.' 
          : 'Username already taken.' 
      });
    }
    
    // Create new user
    const userData = {
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: password
    };
    
    // Add optional profile data
    if (firstName || lastName) {
      userData.profile = {};
      if (firstName) userData.profile.firstName = firstName.trim();
      if (lastName) userData.profile.lastName = lastName.trim();
    }
    
    const user = new User(userData);
    await user.save();
    
    // Generate token
    const token = generateToken(user._id);
    
    // Update last login
    user.stats.lastLogin = new Date();
    await user.save();
    
    res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: user.getPublicProfile()
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Registration failed. Please try again.' 
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { credential, password } = req.body;
    
    // Basic validation
    if (!credential || !password) {
      return res.status(400).json({ 
        error: 'Email/username and password are required.' 
      });
    }
    
    // Find user by email or username
    const user = await User.findByCredentials(credential);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials.' 
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Account is deactivated. Please contact support.' 
      });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Invalid credentials.' 
      });
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    // Update last login
    user.stats.lastLogin = new Date();
    await user.save();
    
    res.json({
      message: 'Login successful.',
      token,
      user: user.getPublicProfile()
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed. Please try again.' 
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    res.json({
      user: req.user.getPublicProfile()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profile.' 
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, bio, favoriteGenres, defaultMood } = req.body;
    
    const user = req.user;
    
    // Update profile fields
    if (firstName !== undefined) {
      user.profile.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      user.profile.lastName = lastName.trim();
    }
    if (bio !== undefined) {
      user.profile.bio = bio.trim();
    }
    if (favoriteGenres && Array.isArray(favoriteGenres)) {
      user.profile.favoriteGenres = favoriteGenres;
    }
    if (defaultMood) {
      user.preferences.defaultMood = defaultMood;
    }
    
    await user.save();
    
    res.json({
      message: 'Profile updated successfully.',
      user: user.getPublicProfile()
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update profile.' 
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required.' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters long.' 
      });
    }
    
    const user = await User.findById(req.userId);
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        error: 'Current password is incorrect.' 
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({
      message: 'Password changed successfully.'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Failed to change password.' 
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    // Generate new token
    const token = generateToken(req.userId);
    
    res.json({
      message: 'Token refreshed successfully.',
      token
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh token.' 
    });
  }
};

// Logout (client-side token removal, but we can log the event)
const logout = async (req, res) => {
  try {
    // In a more complex setup, you might want to blacklist the token
    // For now, just send success response
    res.json({
      message: 'Logged out successfully.'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed.' 
    });
  }
};

// Deactivate account
const deactivateAccount = async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        error: 'Password is required to deactivate account.' 
      });
    }
    
    const user = await User.findById(req.userId);
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Incorrect password.' 
      });
    }
    
    // Deactivate account
    user.isActive = false;
    await user.save();
    
    res.json({
      message: 'Account deactivated successfully.'
    });
    
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ 
      error: 'Failed to deactivate account.' 
    });
  }
};

module.exports.register = register;
module.exports.login = login;
module.exports.getProfile = getProfile;
module.exports.updateProfile = updateProfile;
module.exports.changePassword = changePassword;
module.exports.refreshToken = refreshToken;
module.exports.logout = logout;
module.exports.deactivateAccount = deactivateAccount;
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email address'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    favoriteGenres: [{
      type: String,
      enum: ['rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'country', 'blues', 'reggae', 'folk', 'other']
    }]
  },
  preferences: {
    defaultMood: {
      type: String,
      enum: ['happy', 'sad', 'energetic', 'calm', 'romantic', 'angry', 'nostalgic', 'chill', 'party', 'focus'],
      default: 'chill'
    },
    autoPlaylist: {
      type: Boolean,
      default: false
    }
  },
  // Track user activity
  stats: {
    totalUploads: {
      type: Number,
      default: 0
    },
    totalPlaylists: {
      type: Number,
      default: 0
    },
    lastLogin: {
      type: Date,
      default: Date.now
    }
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
}, {
  timestamps: true, // adds createdAt and updatedAt automatically
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password; // Never return password in JSON
      return ret;
    }
  }
});

// Index for performance
userSchema.index({ createdAt: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to get public profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    profile: this.profile,
    stats: this.stats,
    createdAt: this.createdAt
  };
};

// Static method to find user by email or username
userSchema.statics.findByCredentials = async function(credential) {
  const user = await this.findOne({
    $or: [
      { email: credential.toLowerCase() },
      { username: credential }
    ]
  });
  return user;
};

// Virtual for full name
userSchema.virtual('profile.fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.profile.firstName || this.profile.lastName || this.username;
});

// Ensure virtuals are included when converting to JSON
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
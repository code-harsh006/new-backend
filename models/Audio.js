const mongoose = require('mongoose');

const audioSchema = new mongoose.Schema({
  // Basic audio information
  title: {
    type: String,
    required: [true, 'Audio title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // File information
  filename: {
    type: String,
    required: [true, 'Filename is required']
  },
  originalName: {
    type: String,
    required: [true, 'Original filename is required']
  },
  filePath: {
    type: String,
    required: [true, 'File path is required']
  },
  fileSize: {
    type: Number,
    required: [true, 'File size is required']
  },
  mimeType: {
    type: String,
    required: [true, 'MIME type is required'],
    enum: [
      'audio/mpeg',
      'audio/mp3', 
      'audio/wav', 
      'audio/ogg', 
      'audio/m4a',
      'audio/aac',
      'audio/flac',
      'audio/webm'
    ]
  },
  duration: {
    type: Number, // in seconds
    min: [0, 'Duration cannot be negative']
  },
  
  // Categorization
  mood: {
    type: String,
    required: [true, 'Mood is required'],
    enum: [
      'happy', 'sad', 'energetic', 'calm', 'romantic', 
      'angry', 'nostalgic', 'chill', 'party', 'focus',
      'melancholic', 'upbeat', 'relaxed', 'intense', 'dreamy'
    ]
  },
  environment: {
    type: String,
    required: [true, 'Environment is required'],
    enum: [
      'home', 'office', 'car', 'gym', 'outdoors', 'cafe',
      'rainy day', 'sunny day', 'night', 'morning', 'evening',
      'study', 'work', 'sleep', 'commute', 'social'
    ]
  },
  genre: {
    type: String,
    enum: [
      'rock', 'pop', 'jazz', 'classical', 'electronic', 
      'hip-hop', 'country', 'blues', 'reggae', 'folk',
      'ambient', 'podcast', 'voice-note', 'instrumental', 'other'
    ]
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  // User and ownership
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploader is required']
  },
  
  // Metadata
  metadata: {
    artist: {
      type: String,
      trim: true,
      maxlength: [100, 'Artist name cannot exceed 100 characters']
    },
    album: {
      type: String,
      trim: true,
      maxlength: [100, 'Album name cannot exceed 100 characters']
    },
    year: {
      type: Number,
      min: [1900, 'Year must be after 1900'],
      max: [new Date().getFullYear() + 1, 'Year cannot be in the future']
    },
    bpm: {
      type: Number,
      min: [0, 'BPM cannot be negative'],
      max: [300, 'BPM cannot exceed 300']
    }
  },
  
  // Interaction stats
  stats: {
    playCount: {
      type: Number,
      default: 0,
      min: [0, 'Play count cannot be negative']
    },
    likes: {
      type: Number,
      default: 0,
      min: [0, 'Likes cannot be negative']
    },
    shares: {
      type: Number,
      default: 0,
      min: [0, 'Shares cannot be negative']
    },
    lastPlayed: {
      type: Date
    }
  },
  
  // Privacy and access
  isPublic: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Quality and processing
  quality: {
    bitrate: {
      type: Number,
      min: [0, 'Bitrate cannot be negative']
    },
    sampleRate: {
      type: Number,
      min: [0, 'Sample rate cannot be negative']
    },
    channels: {
      type: Number,
      enum: [1, 2], // mono or stereo
      default: 2
    }
  }
}, {
  timestamps: true, // adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
audioSchema.index({ uploadedBy: 1, createdAt: -1 });
audioSchema.index({ mood: 1, environment: 1 });
audioSchema.index({ isPublic: 1, isActive: 1 });
audioSchema.index({ 'stats.playCount': -1 });
audioSchema.index({ tags: 1 });
audioSchema.index({ genre: 1 });

// Virtual for file URL
audioSchema.virtual('fileUrl').get(function() {
  const isS3 = this.filePath && this.filePath.startsWith('http');
  if (isS3) {
    return this.filePath; // It's an S3 URL
  }
  if (this.filename) {
    return `/uploads/${this.filename}`; // It's a local file
  }
  return null;
});

// Virtual for formatted duration
audioSchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return '0:00';
  
  const minutes = Math.floor(this.duration / 60);
  const seconds = Math.floor(this.duration % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for formatted file size
audioSchema.virtual('formattedFileSize').get(function() {
  if (!this.fileSize) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(this.fileSize) / Math.log(1024));
  return `${(this.fileSize / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
});

// Instance method to increment play count
audioSchema.methods.incrementPlayCount = async function() {
  this.stats.playCount += 1;
  this.stats.lastPlayed = new Date();
  return await this.save();
};

// Instance method to get public info
audioSchema.methods.getPublicInfo = function() {
  return {
    id: this._id,
    title: this.title,
    description: this.description,
    mood: this.mood,
    environment: this.environment,
    genre: this.genre,
    tags: this.tags,
    duration: this.duration,
    formattedDuration: this.formattedDuration,
    fileUrl: this.fileUrl,
    metadata: this.metadata,
    stats: this.stats,
    createdAt: this.createdAt,
    uploadedBy: this.uploadedBy
  };
};

// Static method to find by mood and environment
audioSchema.statics.findByMoodAndEnvironment = function(mood, environment, limit = 20) {
  return this.find({
    mood: mood,
    environment: environment,
    isActive: true,
    isPublic: true
  })
  .populate('uploadedBy', 'username profile.firstName profile.lastName')
  .sort({ 'stats.playCount': -1, createdAt: -1 })
  .limit(limit);
};

// Static method to find user's audio
audioSchema.statics.findByUser = function(userId, includePrivate = false) {
  const query = {
    uploadedBy: userId,
    isActive: true
  };
  
  if (!includePrivate) {
    query.isPublic = true;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .populate('uploadedBy', 'username profile.firstName profile.lastName');
};

// Static method to get trending audio
audioSchema.statics.getTrending = function(limit = 10) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return this.find({
    isActive: true,
    isPublic: true,
    createdAt: { $gte: sevenDaysAgo }
  })
  .sort({ 'stats.playCount': -1, 'stats.likes': -1 })
  .limit(limit)
  .populate('uploadedBy', 'username profile.firstName profile.lastName');
};

// Pre-remove middleware to clean up file
audioSchema.pre('remove', async function(next) {
  try {
    const isS3 = this.filePath && this.filePath.startsWith('http');
    if (isS3) {
      // If there's a filename (S3 key), delete it from S3.
      if (this.filename) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = require('../config/s3');
        
        const command = new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: this.filename,
        });
        await s3Client.send(command);
      }
    } else {
      // Local file deletion
      const fs = require('fs');
      if (this.filePath && fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    }
    next();
  } catch (error) {
    console.error('Error removing file in pre-remove hook:', error);
    next(); // Continue even if file removal fails
  }
});

module.exports = mongoose.model('Audio', audioSchema);
const Audio = require('../models/Audio');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// Upload audio file
const uploadAudio = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No audio file uploaded.' 
      });
    }
    
    const { title, description, mood, environment, genre, tags, artist, album, year, bpm, isPublic } = req.body;
    
    // Basic validation
    if (!title || !mood || !environment) {
      // Clean up uploaded file if validation fails
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        error: 'Title, mood, and environment are required.' 
      });
    }
    
    // Parse tags if provided
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        if (!Array.isArray(parsedTags)) {
          parsedTags = [tags];
        }
      } catch (error) {
        parsedTags = [tags];
      }
    }
    
    // Create audio document
    const isS3Upload = !!req.file.location;

    const audioData = {
      title: title.trim(),
      description: description ? description.trim() : '',
      filename: isS3Upload ? req.file.key : req.file.filename,
      originalName: req.file.originalname,
      filePath: isS3Upload ? req.file.location : req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      mood: mood.toLowerCase(),
      environment: environment.toLowerCase(),
      uploadedBy: req.userId,
      tags: parsedTags,
      isPublic: isPublic === 'true' || isPublic === true
    };
    
    // Add optional fields
    if (genre) audioData.genre = genre.toLowerCase();
    
    // Add metadata if provided
    const metadata = {};
    if (artist) metadata.artist = artist.trim();
    if (album) metadata.album = album.trim();
    if (year) metadata.year = parseInt(year);
    if (bpm) metadata.bpm = parseInt(bpm);
    
    if (Object.keys(metadata).length > 0) {
      audioData.metadata = metadata;
    }
    
    const audio = new Audio(audioData);
    await audio.save();
    
    // Update user's upload count
    await User.findByIdAndUpdate(
      req.userId, 
      { $inc: { 'stats.totalUploads': 1 } }
    );
    
    // Populate the uploadedBy field for response
    await audio.populate('uploadedBy', 'username profile.firstName profile.lastName');
    
    res.status(201).json({
      message: 'Audio uploaded successfully.',
      audio: audio.getPublicInfo()
    });
    
  } catch (error) {
    console.error('Upload audio error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      const isS3 = !!req.file.location;
      if (!isS3 && req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up local file:', cleanupError);
        }
      }
      // For S3, multer-s3 handles cleanup on error automatically
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to upload audio. Please try again.' 
    });
  }
};

// Get user's uploaded audio files
const getUserAudio = async (req, res) => {
  try {
    const { page = 1, limit = 20, mood, environment, genre } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = {
      uploadedBy: req.userId,
      isActive: true
    };
    
    // Add filters
    if (mood) query.mood = mood.toLowerCase();
    if (environment) query.environment = environment.toLowerCase();
    if (genre) query.genre = genre.toLowerCase();
    
    // Get audio files with pagination
    const audioFiles = await Audio.find(query)
      .populate('uploadedBy', 'username profile.firstName profile.lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCount = await Audio.countDocuments(query);
    
    res.json({
      audioFiles: audioFiles.map(audio => audio.getPublicInfo()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + audioFiles.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('Get user audio error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch audio files.' 
    });
  }
};

// Create playlist by mood and environment
const createPlaylist = async (req, res) => {
  try {
    const { mood, environment, limit = 20, includeOwn = false } = req.body;
    
    if (!mood || !environment) {
      return res.status(400).json({ 
        error: 'Mood and environment are required.' 
      });
    }
    
    // Build query
    const query = {
      mood: mood.toLowerCase(),
      environment: environment.toLowerCase(),
      isActive: true,
      isPublic: true
    };
    
    // Include user's own audio if requested
    if (includeOwn) {
      query.$or = [
        { isPublic: true },
        { uploadedBy: req.userId }
      ];
      delete query.isPublic;
    }
    
    // Find matching audio files
    const audioFiles = await Audio.find(query)
      .populate('uploadedBy', 'username profile.firstName profile.lastName')
      .sort({ 'stats.playCount': -1, createdAt: -1 })
      .limit(parseInt(limit));
    
    if (audioFiles.length === 0) {
      return res.status(404).json({ 
        error: 'No audio files found for the specified mood and environment.',
        suggestion: 'Try different mood/environment combinations or upload some audio files first.'
      });
    }
    
    // Update user's playlist count
    await User.findByIdAndUpdate(
      req.userId, 
      { $inc: { 'stats.totalPlaylists': 1 } }
    );
    
    res.json({
      playlist: {
        mood: mood.toLowerCase(),
        environment: environment.toLowerCase(),
        createdAt: new Date(),
        audioFiles: audioFiles.map(audio => audio.getPublicInfo()),
        totalTracks: audioFiles.length
      }
    });
    
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ 
      error: 'Failed to create playlist.' 
    });
  }
};

// Get single audio file
const getAudio = async (req, res) => {
  try {
    const { id } = req.params;
    
    const audio = await Audio.findById(id)
      .populate('uploadedBy', 'username profile.firstName profile.lastName');
    
    if (!audio || !audio.isActive) {
      return res.status(404).json({ 
        error: 'Audio file not found.' 
      });
    }
    
    // Check if user can access this audio
    if (!audio.isPublic && audio.uploadedBy._id.toString() !== req.userId?.toString()) {
      return res.status(403).json({ 
        error: 'Access denied. This audio file is private.' 
      });
    }
    
    res.json({
      audio: audio.getPublicInfo()
    });
    
  } catch (error) {
    console.error('Get audio error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch audio file.' 
    });
  }
};

// Update audio metadata
const updateAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, mood, environment, genre, tags, artist, album, year, bpm, isPublic } = req.body;
    
    const audio = await Audio.findById(id);
    
    if (!audio || !audio.isActive) {
      return res.status(404).json({ 
        error: 'Audio file not found.' 
      });
    }
    
    // Check ownership
    if (audio.uploadedBy.toString() !== req.userId.toString()) {
      return res.status(403).json({ 
        error: 'Access denied. You can only update your own audio files.' 
      });
    }
    
    // Update fields
    if (title) audio.title = title.trim();
    if (description !== undefined) audio.description = description.trim();
    if (mood) audio.mood = mood.toLowerCase();
    if (environment) audio.environment = environment.toLowerCase();
    if (genre) audio.genre = genre.toLowerCase();
    if (isPublic !== undefined) audio.isPublic = isPublic;
    
    // Update tags
    if (tags) {
      try {
        audio.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (error) {
        audio.tags = [tags];
      }
    }
    
    // Update metadata
    if (artist !== undefined) audio.metadata.artist = artist.trim();
    if (album !== undefined) audio.metadata.album = album.trim();
    if (year !== undefined) audio.metadata.year = parseInt(year);
    if (bpm !== undefined) audio.metadata.bpm = parseInt(bpm);
    
    await audio.save();
    await audio.populate('uploadedBy', 'username profile.firstName profile.lastName');
    
    res.json({
      message: 'Audio updated successfully.',
      audio: audio.getPublicInfo()
    });
    
  } catch (error) {
    console.error('Update audio error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update audio file.' 
    });
  }
};

// Delete audio file
const deleteAudio = async (req, res) => {
  try {
    const { id } = req.params;
    
    const audio = await Audio.findById(id);
    
    if (!audio) {
      return res.status(404).json({ 
        error: 'Audio file not found.' 
      });
    }
    
    // Check ownership
    if (audio.uploadedBy.toString() !== req.userId.toString()) {
      return res.status(403).json({ 
        error: 'Access denied. You can only delete your own audio files.' 
      });
    }
    
    // Delete physical file from S3 or local storage
    const isS3 = audio.filePath.startsWith('http');
    if (isS3) {
      if (audio.filename) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = require('../config/s3');
        
        const command = new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: audio.filename, // filename stores the S3 key
        });

        try {
          await s3Client.send(command);
        } catch (s3Error) {
          console.error('Error deleting file from S3:', s3Error);
        }
      }
    } else {
      // Local file deletion
      if (audio.filePath && fs.existsSync(audio.filePath)) {
        try {
          fs.unlinkSync(audio.filePath);
        } catch (fileError) {
          console.error('Error deleting physical file:', fileError);
        }
      }
    }
    
    // Delete from database
    await Audio.findByIdAndDelete(id);
    
    // Update user's upload count
    await User.findByIdAndUpdate(
      req.userId, 
      { $inc: { 'stats.totalUploads': -1 } }
    );
    
    res.json({
      message: 'Audio file deleted successfully.'
    });
    
  } catch (error) {
    console.error('Delete audio error:', error);
    res.status(500).json({ 
      error: 'Failed to delete audio file.' 
    });
  }
};

// Increment play count
const playAudio = async (req, res) => {
  try {
    const { id } = req.params;
    
    const audio = await Audio.findById(id);
    
    if (!audio || !audio.isActive) {
      return res.status(404).json({ 
        error: 'Audio file not found.' 
      });
    }
    
    // Check if user can access this audio
    if (!audio.isPublic && audio.uploadedBy.toString() !== req.userId?.toString()) {
      return res.status(403).json({ 
        error: 'Access denied. This audio file is private.' 
      });
    }
    
    // Increment play count
    await audio.incrementPlayCount();
    
    res.json({
      message: 'Play count updated.',
      playCount: audio.stats.playCount
    });
    
  } catch (error) {
    console.error('Play audio error:', error);
    res.status(500).json({ 
      error: 'Failed to update play count.' 
    });
  }
};

// Get trending audio
const getTrending = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const trendingAudio = await Audio.getTrending(parseInt(limit));
    
    res.json({
      trending: trendingAudio.map(audio => audio.getPublicInfo())
    });
    
  } catch (error) {
    console.error('Get trending error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch trending audio.' 
    });
  }
};

// Search audio files
const searchAudio = async (req, res) => {
  try {
    const { q, mood, environment, genre, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build search query
    const query = {
      isActive: true,
      isPublic: true
    };
    
    // Text search
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
        { 'metadata.artist': { $regex: q, $options: 'i' } },
        { 'metadata.album': { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filters
    if (mood) query.mood = mood.toLowerCase();
    if (environment) query.environment = environment.toLowerCase();
    if (genre) query.genre = genre.toLowerCase();
    
    // Search with pagination
    const audioFiles = await Audio.find(query)
      .populate('uploadedBy', 'username profile.firstName profile.lastName')
      .sort({ 'stats.playCount': -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await Audio.countDocuments(query);
    
    res.json({
      results: audioFiles.map(audio => audio.getPublicInfo()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + audioFiles.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('Search audio error:', error);
    res.status(500).json({ 
      error: 'Search failed.' 
    });
  }
};

module.exports.uploadAudio = uploadAudio;
module.exports.getUserAudio = getUserAudio;
module.exports.createPlaylist = createPlaylist;
module.exports.getAudio = getAudio;
module.exports.updateAudio = updateAudio;
module.exports.deleteAudio = deleteAudio;
module.exports.playAudio = playAudio;
module.exports.getTrending = getTrending;
module.exports.searchAudio = searchAudio;
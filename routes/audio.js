const express = require('express');
const multer = require('multer');
const path = require('path');
const multerS3 = require('multer-s3');
const s3Client = require('../config/s3');
const router = express.Router();

// Import controllers
const {
  uploadAudio,
  getUserAudio,
  createPlaylist,
  getAudio,
  updateAudio,
  deleteAudio,
  playAudio,
  getTrending,
  searchAudio
} = require('../controllers/audioController');

// Import middleware
const { authMiddleware, optionalAuthMiddleware, uploadRateLimit } = require('../middleware/authMiddleware');

// File filter for audio files only
const fileFilter = (req, file, cb) => {
  // Check if file is audio
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed!'), false);
  }
};

let storage;
// Use S3 storage if configured, otherwise fall back to local disk storage
if (process.env.S3_BUCKET_NAME) {
  storage = multerS3({
    s3: s3Client,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'public-read', // Make files publicly readable
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, 'audio-' + uniqueSuffix + extension);
    },
  });
  console.log('✅ S3 upload storage configured.');
} else {
  console.log('⚠️ S3 not configured. Using local file storage for uploads.');
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, process.env.UPLOAD_PATH || './uploads');
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
  });
}

// Configure multer for file uploads
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 1 // Only one file at a time
  }
});

// @route   POST /api/audio/upload
// @desc    Upload audio file with metadata
// @access  Private
router.post('/upload', 
  authMiddleware, 
  uploadRateLimit,
  upload.single('audio'), 
  uploadAudio
);

// @route   GET /api/audio/user
// @desc    Get current user's uploaded audio files
// @access  Private
router.get('/user', authMiddleware, getUserAudio);

// @route   POST /api/audio/playlist
// @desc    Create playlist by mood and environment
// @access  Private
router.post('/playlist', authMiddleware, createPlaylist);

// @route   GET /api/audio/trending
// @desc    Get trending audio files
// @access  Public (but can be enhanced with optional auth)
router.get('/trending', optionalAuthMiddleware, getTrending);

// @route   GET /api/audio/search
// @desc    Search audio files
// @access  Public (but can be enhanced with optional auth)
router.get('/search', optionalAuthMiddleware, searchAudio);

// @route   GET /api/audio/:id
// @desc    Get single audio file
// @access  Public/Private (depends on audio privacy)
router.get('/:id', optionalAuthMiddleware, getAudio);

// @route   PUT /api/audio/:id
// @desc    Update audio metadata
// @access  Private
router.put('/:id', authMiddleware, updateAudio);

// @route   DELETE /api/audio/:id
// @desc    Delete audio file
// @access  Private
router.delete('/:id', authMiddleware, deleteAudio);

// @route   POST /api/audio/:id/play
// @desc    Increment play count for an audio file
// @access  Public
router.post('/:id/play', optionalAuthMiddleware, playAudio);

module.exports = router;
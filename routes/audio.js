const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const audioController = require('../controllers/audioController');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_FOLDER || './uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /mp3|wav|ogg|m4a/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only audio files are allowed (mp3, wav, ogg, m4a)'));
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Protect all audio routes with authentication
router.use(authMiddleware);

// Upload audio file
router.post('/upload', upload.single('audio'), audioController.uploadAudio);

// Get audios by current user
router.get('/user', audioController.getUserAudios);

// Get playlist by mood and environment
router.post('/playlist', audioController.getPlaylist);

module.exports = router;

const supabase = require('../supabase/client');
const storage = require('../utils/storage');
const { v4: uuidv4 } = require('uuid');

// Upload audio file and save metadata
const uploadAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const { title, mood, environment } = req.body;
    const userId = req.user.id;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;

    // Upload file to storage (S3 or local)
    const { filePath, location } = await storage.uploadFile(req.file);

    // Insert metadata into Supabase
    const { data, error } = await supabase
      .from('audios')
      .insert([
        {
          user_id: userId,
          title: title || originalName,
          mood: mood || 'unspecified',
          environment: environment || 'unspecified',
          file_path: filePath,
          file_url: location,
          file_size: fileSize,
          file_type: fileType,
          original_name: originalName,
        }
      ])
      .select();

    if (error) {
      // Clean up the uploaded file if DB insert fails
      await storage.deleteFile(filePath);
      throw error;
    }

    res.status(201).json({
      message: 'Audio uploaded successfully',
      audio: data[0],
    });
  } catch (error) {
    console.error('Audio upload error:', error);
    res.status(500).json({ error: 'Internal server error during audio upload' });
  }
};

// Get audios by current user
const getUserAudios = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('audios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Add full URLs to each audio file
    const audiosWithUrls = await Promise.all(data.map(async audio => {
      const fileUrl = await storage.getFileUrl(audio.file_path);
      return { ...audio, file_url: fileUrl };
    }));

    res.status(200).json({
      count: audiosWithUrls.length,
      audios: audiosWithUrls,
    });
  } catch (error) {
    console.error('Get user audios error:', error);
    res.status(500).json({ error: 'Internal server error fetching user audios' });
  }
};

// Get playlist by mood and environment
const getPlaylist = async (req, res) => {
  try {
    const { mood, environment } = req.body;

    if (!mood && !environment) {
      return res.status(400).json({ error: 'At least one filter (mood or environment) is required' });
    }

    let query = supabase
      .from('audios')
      .select('*');

    if (mood) {
      query = query.ilike('mood', `%${mood}%`);
    }

    if (environment) {
      query = query.ilike('environment', `%${environment}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Add full URLs to each audio file
    const audiosWithUrls = await Promise.all(data.map(async audio => {
      const fileUrl = await storage.getFileUrl(audio.file_path);
      return { ...audio, file_url: fileUrl };
    }));

    res.status(200).json({
      count: audiosWithUrls.length,
      audios: audiosWithUrls,
    });
  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({ error: 'Internal server error fetching playlist' });
  }
};

module.exports = {
  uploadAudio,
  getUserAudios,
  getPlaylist,
};

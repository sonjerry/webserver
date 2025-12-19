const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

const { authenticateToken } = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// POST /files (증빙 등 일반 파일 업로드)
router.post('/', authenticateToken, uploadMiddleware, async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: '업로드할 파일이 필요합니다.' });
  }

  try {
    const uploadDir = path.join(__dirname, '../uploads/files');
    await fs.mkdir(uploadDir, { recursive: true });

    const safeOriginalName = file.originalname.replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = `${Date.now()}_${safeOriginalName}`;
    const relativePath = path.join('files', fileName);

    await fs.writeFile(path.join(uploadDir, fileName), file.buffer);

    res.status(201).json({
      file_path: relativePath,
      url: `/uploads/${relativePath}`,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

module.exports = router;



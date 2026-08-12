const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Configure disk storage with UUID filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Layer 2: Extension & MIME filter
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pdf',
    'application/octet-stream' // Fallback
  ];
  const allowedExts = ['.ppt', '.pptx', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PowerPoint (.ppt/.pptx) and PDF (.pdf) files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.maxFileSize
  }
});

/**
 * Layer 3: Magic Byte Verification Middleware (Post-Multer)
 * Inspects binary header signatures to prevent malicious file extension spoofing.
 */
function validateMagicBytes(req, res, next) {
  if (!req.file) return next();

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();

  fs.open(filePath, 'r', (err, fd) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to inspect uploaded file' });
    }

    const buffer = Buffer.alloc(8);
    fs.read(fd, buffer, 0, 8, 0, (readErr) => {
      fs.close(fd, () => {});

      if (readErr) {
        safeDelete(filePath);
        return res.status(400).json({ error: 'Corrupted file header' });
      }

      let isValid = false;

      if (ext === '.pptx') {
        // ZIP magic bytes: PK (0x50 0x4B)
        isValid = buffer[0] === 0x50 && buffer[1] === 0x4B;
      } else if (ext === '.ppt') {
        // OLE2 magic bytes: D0 CF 11 E0
        isValid = buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
      } else if (ext === '.pdf') {
        // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
        isValid = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D;
      } else {
        // Double-check all for fallback MIME types
        isValid = (buffer[0] === 0x50 && buffer[1] === 0x4B) ||
                  (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) ||
                  (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D);
      }

      if (!isValid) {
        safeDelete(filePath);
        console.warn(`[SECURITY] Magic byte check failed for ${req.file.originalname}`);
        return res.status(400).json({ error: 'Invalid file signature. File is not a valid presentation or PDF.' });
      }

      next();
    });
  });
}

function safeDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {}
}

module.exports = {
  upload,
  validateMagicBytes
};

const express = require('express');
const router = express.Router();
const fs = require('fs');
const sessionManager = require('../services/sessionManager');
const converter = require('../services/converter');
const path = require('path');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { upload, validateMagicBytes } = require('../middleware/validation');

const CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * POST /api/upload
 * Upload a presentation file (.ppt/.pptx), convert to PDF, create viewing session
 */
router.post('/upload', uploadLimiter, upload.single('file'), validateMagicBytes, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const uploadedFilePath = req.file.path;

  try {
    console.log(`[UPLOAD] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let pdfPath, pageCount;

    if (ext === 'pdf') {
      // It's already a PDF, bypass conversion
      pdfPath = uploadedFilePath;
      pageCount = converter.extractPdfPageCount(uploadedFilePath);
      console.log(`[UPLOAD] Bypass conversion. Extracted ${pageCount} pages from PDF.`);
    } else {
      // Convert PPT/PPTX to PDF via LibreOffice
      const result = await converter.convertToPDF(uploadedFilePath);
      pdfPath = result.pdfPath;
      pageCount = result.pageCount;
    }

    // Create session in store
    const session = sessionManager.createSession({
      originalName: req.file.originalname,
      pptxPath: uploadedFilePath,
      pdfPath: pdfPath,
      pageCount: pageCount,
    });

    return res.status(201).json({
      code: session.code,
      slideCount: session.pageCount,
      expiresAt: session.expiresAt.toISOString()
    });

  } catch (err) {
    console.error('[UPLOAD] Processing error:', err);

    // Cleanup uploaded file on error
    if (fs.existsSync(uploadedFilePath)) {
      try { fs.unlinkSync(uploadedFilePath); } catch (e) {}
    }

    return res.status(500).json({
      error: err.message || 'File conversion failed. Please try again.'
    });
  }
});

/**
 * GET /api/slides/:code
 * Serve the converted PDF file stream for client rendering in PDF.js
 */
router.get('/slides/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  const session = sessionManager.getSession(code);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (!fs.existsSync(session.pdfPath)) {
    return res.status(404).json({ error: 'Converted slide file missing' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  return res.sendFile(session.pdfPath);
});

/**
 * GET /api/session/:code
 * Validate session existence and retrieve metadata (used by mobile app / quick join)
 */
router.get('/session/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  const session = sessionManager.getSession(code);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  return res.json({
    code: session.code,
    slideCount: session.pageCount,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    isPresenterConnected: !!(session.presenterWs && session.presenterWs.readyState === 1)
  });
});

module.exports = router;

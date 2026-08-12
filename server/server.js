const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const uploadRoutes = require('./routes/upload');
const { apiLimiter } = require('./middleware/rateLimiter');
const sessionManager = require('./services/sessionManager');
const { initWebSocket } = require('./websocket/handler');
const { startCleanupScheduler } = require('./services/cleanup');

const app = express();

// Security Headers (Helmet.js configured as per 06-security-and-cleanup.md)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
}));

// CORS Configuration
app.use(cors({
  origin: config.allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiLimiter);
app.use('/api', uploadRoutes);

// Static Frontend Files
const frontendPath = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Fallback to index.html for SPA routing if needed
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global Error Handler (catches Multer and validation errors)
const multer = require('multer');
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum 50 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP Server
const server = http.createServer(app);

// Attach WebSocket Handler
initWebSocket(server, sessionManager);

// Start 24h Expired File Cleanup Scheduler & Startup Orphan Scan
startCleanupScheduler(sessionManager);

// Start Server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`  PPT Viewer Server running on http://localhost:${config.port}`);
  console.log(`  Frontend served from: ${frontendPath}`);
  console.log(`  Upload directory: ${config.uploadDir}`);
  console.log(`===================================================`);
});

module.exports = server;

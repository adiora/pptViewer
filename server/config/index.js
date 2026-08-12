const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 54740,
  uploadDir: path.resolve(__dirname, '../uploads'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024, // 50 MB
  sessionTTL: parseInt(process.env.SESSION_TTL, 10) || 24 * 60 * 60 * 1000, // 24 hours
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  libreOfficePath: process.env.LIBREOFFICE_PATH || 'libreoffice',
  cleanupInterval: process.env.CLEANUP_INTERVAL || '*/30 * * * *', // Every 30 mins
  codeLength: 6,
  codeCharset: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // Exclude ambiguous 0/O, 1/I/L
  wsHeartbeatInterval: 30000, // 30 seconds
  maxControllersPerSession: 5,
};

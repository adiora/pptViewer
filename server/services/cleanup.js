const cron = require('node-cron');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const config = require('../config');

/**
 * Start cron scheduler for periodic session & file cleanup (24h TTL)
 * @param {Object} sessionManager 
 */
function startCleanupScheduler(sessionManager) {
  console.log(`[CLEANUP] Starting cleanup scheduler (${config.cleanupInterval})`);

  // Run cleanup for any orphaned files on startup
  // cleanupOrphanedFiles(sessionManager);

  cron.schedule(config.cleanupInterval, async () => {
    console.log('[CLEANUP] Running scheduled session cleanup...');
    const expiredSessions = sessionManager.getExpiredSessions();

    if (expiredSessions.length === 0) {
      console.log('[CLEANUP] No expired sessions found.');
      return;
    }

    let cleanedCount = 0;

    for (const session of expiredSessions) {
      try {
        // 1. Close presenter WS connection
        if (session.presenterWs && session.presenterWs.readyState === 1) {
          session.presenterWs.send(JSON.stringify({
            type: 'SESSION_EXPIRED',
            message: 'Session expired after 24 hours'
          }));
          session.presenterWs.close(4005, 'Session expired');
        }

        // 2. Close controller WS connections
        if (session.controllerWs && session.controllerWs.length > 0) {
          for (const ws of session.controllerWs) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'SESSION_EXPIRED',
                message: 'Session expired after 24 hours'
              }));
              ws.close(4005, 'Session expired');
            }
          }
        }

        // 3. Delete files from uploads/
        try { await fsPromises.unlink(session.pptxPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        try { await fsPromises.unlink(session.pdfPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }

        // 4. Remove session from in-memory store
        sessionManager.deleteSession(session.code);
        cleanedCount++;

        console.log(`[CLEANUP] Cleaned up session ${session.code}`);

      } catch (err) {
        console.error(`[CLEANUP] Failed cleaning up session ${session.code}:`, err);
      }
    }

    console.log(`[CLEANUP] Completed. Removed ${cleanedCount} expired sessions.`);
  });
}

/**
 * Startup scan to clean up orphaned files in uploads directory (e.g. from crash or ungraceful shutdown)
 * @param {Object} sessionManager 
 */
function cleanupOrphanedFiles(sessionManager) {
  try {
    const uploadDir = config.uploadDir;
    if (!fs.existsSync(uploadDir)) return;

    const files = fs.readdirSync(uploadDir);
    const activePaths = new Set();

    for (const session of sessionManager.sessions.values()) {
      if (session.pptxPath) activePaths.add(path.basename(session.pptxPath));
      if (session.pdfPath) activePaths.add(path.basename(session.pdfPath));
    }

    let orphanCount = 0;
    for (const file of files) {
      if (file === '.gitkeep') continue;
      if (!activePaths.has(file)) {
        try {
          fs.unlinkSync(path.join(uploadDir, file));
          orphanCount++;
        } catch (e) {}
      }
    }

    if (orphanCount > 0) {
      console.log(`[CLEANUP] Removed ${orphanCount} orphaned files from uploads directory.`);
    }
  } catch (err) {
    console.warn('[CLEANUP] Startup orphan scan warning:', err);
  }
}

module.exports = {
  startCleanupScheduler,
  cleanupOrphanedFiles
};

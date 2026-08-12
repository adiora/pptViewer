const crypto = require('crypto');
const config = require('../config');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Create a new session object and save it to the in-memory Map
   * @param {Object} data - { originalName, pptxPath, pdfPath, pageCount }
   * @returns {Object} session
   */
  createSession({ originalName, pptxPath, pdfPath, pageCount }) {
    const code = this.generateCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.sessionTTL);

    const session = {
      code,
      originalName,
      pptxPath,
      pdfPath,
      pageCount,
      currentSlide: 1,
      createdAt: now,
      expiresAt: expiresAt,
      presenterWs: null,
      controllerWs: [],
    };

    this.sessions.set(code, session);
    console.log(`[SESSION] Created session ${code} (expires: ${expiresAt.toISOString()})`);
    return session;
  }

  /**
   * Get session by code
   * @param {string} code 
   * @returns {Object|null}
   */
  getSession(code) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
    return this.sessions.get(cleanCode) || null;
  }

  /**
   * Delete a session by code
   * @param {string} code 
   * @returns {boolean}
   */
  deleteSession(code) {
    if (!code) return false;
    const cleanCode = code.trim().toUpperCase();
    return this.sessions.delete(cleanCode);
  }

  /**
   * Get list of all expired sessions
   * @returns {Array<Object>}
   */
  getExpiredSessions() {
    const now = Date.now();
    const expired = [];
    for (const session of this.sessions.values()) {
      if (now > session.expiresAt.getTime()) {
        expired.push(session);
      }
    }
    return expired;
  }

  /**
   * Generate a unique 6-character code
   * @returns {string}
   */
  generateCode() {
    const charset = config.codeCharset;
    const len = config.codeLength;
    let attempts = 0;
    
    while (attempts < 20) {
      const randomBytes = crypto.randomBytes(len);
      let result = '';
      for (let i = 0; i < len; i++) {
        result += charset[randomBytes[i] % charset.length];
      }

      if (!this.sessions.has(result)) {
        return result;
      }
      attempts++;
    }

    throw new Error('Failed to generate a unique session code after multiple attempts.');
  }
}

module.exports = new SessionManager();

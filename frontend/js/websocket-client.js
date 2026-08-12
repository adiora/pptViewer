/**
 * PPT Viewer — Presenter WebSocket Client Module
 * Manages WebSocket real-time connection to the server for remote control commands.
 */

class PresenterWSClient {
  constructor() {
    this.ws = null;
    this.code = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 1000; // 1 second
    this.reconnectTimer = null;

    this.commandCallback = null;
    this.statusCallback = null;
    this.isManuallyClosed = false;
  }

  /**
   * Connect to WebSocket server as presenter
   * @param {string} code - 6-character session code
   */
  connect(code) {
    if (!code) return;
    this.code = code;
    this.isManuallyClosed = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?code=${code}&role=presenter`;

    this._notifyStatus('connecting', 'Connecting to remote server...');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected to session:', code);
        this.reconnectAttempts = 0;
        this._notifyStatus('connected', 'Waiting for mobile remote...');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.error('[WS] Failed to parse message:', event.data);
        }
      };

      this.ws.onclose = (event) => {
        this._handleClose(event);
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Socket error:', error);
      };

    } catch (err) {
      console.error('[WS] Failed to establish connection:', err);
      this._scheduleReconnect();
    }
  }

  /**
   * Process incoming WebSocket messages
   * @param {Object} msg 
   */
  _handleMessage(msg) {
    switch (msg.type) {
      case 'JOINED':
        console.log('[WS] Joined session:', msg);
        if (msg.peers && msg.peers.controllerCount > 0) {
          this._notifyStatus('remote_connected', `Remote Connected (${msg.peers.controllerCount})`);
        }
        break;

      case 'COMMAND':
        console.log('[WS] Command received:', msg.action);
        if (this.commandCallback) {
          this.commandCallback(msg.action);
        }
        break;

      case 'PEER_CONNECTED':
        console.log('[WS] Peer connected:', msg);
        if (msg.role === 'controller') {
          const count = msg.controllerCount || 1;
          this._notifyStatus('remote_connected', `Remote Connected (${count})`);
        }
        break;

      case 'PEER_DISCONNECTED':
        console.log('[WS] Peer disconnected:', msg);
        if (msg.role === 'controller') {
          const count = msg.controllerCount || 0;
          if (count === 0) {
            this._notifyStatus('remote_disconnected', 'Waiting for mobile remote...');
          } else {
            this._notifyStatus('remote_connected', `Remote Connected (${count})`);
          }
        }
        break;

      case 'SESSION_EXPIRED':
        this.isManuallyClosed = true;
        this._notifyStatus('expired', 'Session expired (24h limit reached)');
        break;

      case 'ERROR':
        console.warn('[WS] Server error message:', msg.message);
        this._notifyStatus('error', msg.message);
        break;

      default:
        console.log('[WS] Unknown message type:', msg);
    }
  }

  /**
   * Handle WebSocket disconnection and reconnect logic
   * @param {CloseEvent} event 
   */
  _handleClose(event) {
    if (this.isManuallyClosed) return;

    // Explicit rejection codes from server (do not reconnect)
    const rejectionReasons = {
      4001: 'Invalid or expired session code',
      4002: 'Invalid connection role',
      4003: 'Another presenter is already connected to this session',
      4004: 'Maximum controller limit reached',
      4005: 'Session has expired'
    };

    if (rejectionReasons[event.code]) {
      const reason = rejectionReasons[event.code];
      console.error(`[WS] Connection rejected (${event.code}): ${reason}`);
      this._notifyStatus('rejected', reason);
      return;
    }

    // Attempt exponential backoff reconnect
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._notifyStatus('failed', 'Lost connection to server. Please refresh.');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    this._notifyStatus('reconnecting', `Reconnecting in ${Math.round(delay / 1000)}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.code);
    }, delay);
  }

  /**
   * Send current slide update to server (relayed to mobile app)
   * @param {number} currentSlide 
   * @param {number} totalSlides 
   */
  sendSlideUpdate(currentSlide, totalSlides) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SLIDE_UPDATE',
        currentSlide: currentSlide,
        totalSlides: totalSlides
      }));
    }
  }

  /**
   * Register command handler callback
   * @param {Function} callback - fn(action: 'NEXT_SLIDE'|'PREV_SLIDE'|'PLAY_VIDEO')
   */
  onCommand(callback) {
    this.commandCallback = callback;
  }

  /**
   * Register status change handler callback
   * @param {Function} callback - fn(state, message)
   */
  onStatusChange(callback) {
    this.statusCallback = callback;
  }

  _notifyStatus(state, message) {
    if (this.statusCallback) {
      this.statusCallback(state, message);
    }
  }

  disconnect() {
    this.isManuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close(1000, 'Presenter exited');
    }
  }
}

// Export singleton instance for viewer.js
window.wsClient = new PresenterWSClient();

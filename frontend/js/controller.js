/**
 * PPT Viewer — Web Remote Controller Module
 * Web-based fallback controller with auto-reconnect and Media Session API integration.
 */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('status-text');
  const setupSection = document.getElementById('setup-section');
  const controlsSection = document.getElementById('controls-section');
  const codeInput = document.getElementById('code-input');
  const connectBtn = document.getElementById('connect-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const playBtn = document.getElementById('play-btn');
  const slideInfo = document.getElementById('slide-info');
  const silentAudio = document.getElementById('silent-audio');

  let ws = null;
  let sessionCode = new URLSearchParams(window.location.search).get('code') || '';
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000;
  let reconnectTimer = null;
  let intentionalClose = false;

  if (sessionCode) {
    codeInput.value = sessionCode;
  }

  connectBtn.addEventListener('click', () => {
    sessionCode = codeInput.value.trim().toUpperCase();
    if (sessionCode.length === 6) {
      intentionalClose = false;
      reconnectAttempts = 0;
      connect(sessionCode);
      silentAudio.play().catch(() => {});
    }
  });

  function connect(code) {
    statusText.textContent = 'Connecting...';
    statusText.style.color = 'var(--text-secondary)';
    setupSection.hidden = true;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws?code=${code}&role=controller`;

    try {
      ws = new WebSocket(url);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectAttempts = 0;
      statusText.textContent = 'Connected';
      statusText.style.color = 'var(--success)';
      controlsSection.hidden = false;
      setupMediaSession();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'JOINED':
            if (msg.currentSlide && msg.slideCount) {
              slideInfo.textContent = `Slide ${msg.currentSlide} / ${msg.slideCount}`;
            }
            break;
          case 'SLIDE_SYNC':
            slideInfo.textContent = `Slide ${msg.currentSlide} / ${msg.totalSlides}`;
            break;
          case 'PEER_CONNECTED':
            if (msg.role === 'presenter') {
              statusText.textContent = 'Presenter connected';
              statusText.style.color = 'var(--success)';
            }
            break;
          case 'PEER_DISCONNECTED':
            if (msg.role === 'presenter') {
              statusText.textContent = 'Presenter disconnected';
              statusText.style.color = 'var(--warning)';
            }
            break;
          case 'SESSION_EXPIRED':
            intentionalClose = true;
            alert('Session expired');
            reset();
            break;
          case 'ERROR':
            statusText.textContent = msg.message || 'Error';
            statusText.style.color = 'var(--error)';
            break;
        }
      } catch (e) {}
    };

    ws.onclose = (event) => {
      if (intentionalClose) return;

      const rejectionCodes = {
        4001: 'Invalid or expired code',
        4002: 'Invalid role',
        4003: 'Presenter slot taken',
        4004: 'Too many controllers',
        4005: 'Session expired'
      };

      if (rejectionCodes[event.code]) {
        statusText.textContent = rejectionCodes[event.code];
        statusText.style.color = 'var(--error)';
        setTimeout(reset, 3000);
        return;
      }

      scheduleReconnect();
    };

    ws.onerror = () => {};
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      statusText.textContent = 'Connection lost. Please refresh.';
      statusText.style.color = 'var(--error)';
      setTimeout(reset, 3000);
      return;
    }

    reconnectAttempts++;
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 30000);
    statusText.textContent = `Reconnecting in ${Math.round(delay / 1000)}s (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
    statusText.style.color = 'var(--warning)';

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(sessionCode), delay);
  }

  function sendCommand(action) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'COMMAND', action }));
    }
  }

  prevBtn.addEventListener('click', () => sendCommand('PREV_SLIDE'));
  nextBtn.addEventListener('click', () => sendCommand('NEXT_SLIDE'));
  playBtn.addEventListener('click', () => sendCommand('PLAY_VIDEO'));

  function reset() {
    clearTimeout(reconnectTimer);
    setupSection.hidden = false;
    controlsSection.hidden = true;
    statusText.textContent = '';
    statusText.style.color = '';
  }

  function setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'PPT Remote Control',
        artist: 'PPT Viewer',
        album: 'Session ' + sessionCode
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => sendCommand('PREV_SLIDE'));
      navigator.mediaSession.setActionHandler('nexttrack', () => sendCommand('NEXT_SLIDE'));
    }
  }
});

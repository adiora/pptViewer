/**
 * PPT Viewer — Slide Viewer Module
 * Handles PDF rendering via PDF.js, dynamic aspect-ratio canvas scaling,
 * keyboard/touch navigation, video overlay playback, and WebSocket remote integration.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── DOM References ──
  const canvas = document.getElementById('slide-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const slideContainer = document.getElementById('slide-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  const currentSlideEl = document.getElementById('current-slide');
  const totalSlidesEl = document.getElementById('total-slides');
  const prevArrow = document.getElementById('prev-arrow');
  const nextArrow = document.getElementById('next-arrow');

  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  
  const toolbar = document.getElementById('toolbar');
  const toolbarCode = document.getElementById('toolbar-code');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  const videoOverlay = document.getElementById('video-overlay');
  const slideVideo = document.getElementById('slide-video');

  // ── Viewer State ──
  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 1;
  let sessionCode = null;
  
  let isRendering = false;
  let pageNumPending = null;
  let toolbarTimer = null;
  let resizeTimeout = null;

  // Touch Swipe tracking
  let touchStartX = 0;
  let touchStartY = 0;

  initViewer();

  function initViewer() {
    // 1. Extract session code from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    sessionCode = (urlParams.get('code') || '').trim().toUpperCase();

    if (!sessionCode || sessionCode.length !== 6) {
      alert('Invalid or missing session code. Redirecting to home page.');
      window.location.href = '/';
      return;
    }

    toolbarCode.textContent = `Code: ${sessionCode}`;

    // 2. Check PDF.js availability
    if (!window.pdfjsLib) {
      showLoadingError('PDF.js library failed to load. Check network connection.');
      return;
    }

    // 3. Load PDF Document from Server API
    const pdfUrl = `/api/slides/${sessionCode}`;
    loadingText.textContent = 'Fetching presentation slides...';

    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    
    loadingTask.promise.then((pdf) => {
      pdfDoc = pdf;
      totalPages = pdf.numPages;
      totalSlidesEl.textContent = totalPages;

      // Hide loader and render first slide
      loadingOverlay.style.display = 'none';
      renderSlide(currentPage);

      // Initialize WebSocket Client connection
      initWebSocketConnection();

      // Setup UI listeners
      setupNavigationListeners();
      setupToolbarAutoHide();
      setupTouchGestures();

    }).catch((err) => {
      console.error('[VIEWER] PDF load error:', err);
      let errMsg = 'Failed to load slide presentation.';
      if (err.status === 404) errMsg = 'Session expired or presentation not found.';
      showLoadingError(errMsg);
    });
  }

  // ── PDF.js Slide Rendering Algorithm ──
  function renderSlide(pageNumber) {
    if (!pdfDoc) return;
    if (pageNumber < 1 || pageNumber > totalPages) return;

    if (isRendering) {
      pageNumPending = pageNumber;
      return;
    }

    isRendering = true;

    pdfDoc.getPage(pageNumber).then((page) => {
      // Calculate scale to fit viewport while preserving PDF aspect ratio
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;

      const scaleX = containerWidth / unscaledViewport.width;
      const scaleY = containerHeight / unscaledViewport.height;
      const scale = Math.min(scaleX, scaleY);

      const viewport = page.getViewport({ scale });

      // Support high DPI / Retina screens for crisp text
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

      const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);

      renderTask.promise.then(() => {
        isRendering = false;
        currentPage = pageNumber;
        currentSlideEl.textContent = currentPage;

        // Notify WebSocket server of slide change
        if (window.wsClient) {
          window.wsClient.sendSlideUpdate(currentPage, totalPages);
        }

        // Process pending render requests
        if (pageNumPending !== null) {
          const pending = pageNumPending;
          pageNumPending = null;
          renderSlide(pending);
        }
      }).catch((renderErr) => {
        console.error('[VIEWER] Render error:', renderErr);
        isRendering = false;
      });
    });
  }

  // ── Navigation Control Methods ──
  function nextSlide() {
    if (currentPage < totalPages) {
      renderSlide(currentPage + 1);
    }
  }

  function prevSlide() {
    if (currentPage > 1) {
      renderSlide(currentPage - 1);
    }
  }

  function goToSlide(n) {
    if (n >= 1 && n <= totalPages) {
      renderSlide(n);
    }
  }

  // ── Video Overlay Player Control ──
  function toggleVideoPlayback() {
    if (!videoOverlay) return;

    // Check if video is visible
    if (!videoOverlay.hidden && slideVideo) {
      if (slideVideo.paused) {
        slideVideo.play();
        showToast('Video Playing', 'Media playback started', 'info');
      } else {
        slideVideo.pause();
        showToast('Video Paused', 'Media playback paused', 'info');
      }
    } else {
      // Toggle visibility if a video source exists
      if (slideVideo && slideVideo.src) {
        videoOverlay.hidden = !videoOverlay.hidden;
        if (!videoOverlay.hidden) slideVideo.play();
      } else {
        showToast('No Video Found', 'Current slide has no video elements', 'warning');
      }
    }
  }

  // ── Fullscreen Toggle ──
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('[VIEWER] Fullscreen request error:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // ── Setup UI Event Listeners ──
  function setupNavigationListeners() {
    // Buttons
    if (prevArrow) prevArrow.addEventListener('click', prevSlide);
    if (nextArrow) nextArrow.addEventListener('click', nextSlide);
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore key events if focus is inside an input/button
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          nextSlide();
          break;

        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          prevSlide();
          break;

        case 'Home':
          e.preventDefault();
          goToSlide(1);
          break;

        case 'End':
          e.preventDefault();
          goToSlide(totalPages);
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;

        case 'v':
        case 'V':
          e.preventDefault();
          toggleVideoPlayback();
          break;
      }
    });

    // Window Resize Handler (Re-scale canvas)
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        renderSlide(currentPage);
      }, 150);
    });
  }

  // ── Auto-Hiding Toolbar ──
  function setupToolbarAutoHide() {
    const resetToolbarTimer = () => {
      toolbar.classList.remove('toolbar--hidden');
      clearTimeout(toolbarTimer);
      toolbarTimer = setTimeout(() => {
        toolbar.classList.add('toolbar--hidden');
      }, 3000);
    };

    document.addEventListener('mousemove', resetToolbarTimer);
    toolbar.addEventListener('mouseenter', () => {
      clearTimeout(toolbarTimer);
      toolbar.classList.remove('toolbar--hidden');
    });

    resetToolbarTimer();
  }

  // ── Touch Gesture Controls (Swipe Left / Right) ──
  function setupTouchGestures() {
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // Ensure horizontal swipe
      if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) {
          nextSlide(); // Swipe Left -> Next
        } else {
          prevSlide(); // Swipe Right -> Prev
        }
      }
    }, { passive: true });
  }

  // ── WebSocket Server Integration ──
  function initWebSocketConnection() {
    if (!window.wsClient) return;

    // Handle Commands from Mobile Controller
    window.wsClient.onCommand((action) => {
      console.log('[VIEWER] Remote command received:', action);
      switch (action) {
        case 'NEXT_SLIDE':
          nextSlide();
          showCommandFeedback('→ Next Slide');
          break;

        case 'PREV_SLIDE':
          prevSlide();
          showCommandFeedback('← Previous Slide');
          break;

        case 'PLAY_VIDEO':
          toggleVideoPlayback();
          break;

        default:
          console.warn('[VIEWER] Unknown remote command:', action);
      }
    });

    // Handle Status Updates
    window.wsClient.onStatusChange((state, message) => {
      updateConnectionStatusUI(state, message);
    });

    // Establish WS connection
    window.wsClient.connect(sessionCode);
  }

  function updateConnectionStatusUI(state, message) {
    if (!connectionDot || !connectionText) return;

    connectionText.textContent = message;
    connectionDot.className = 'connection-dot';

    switch (state) {
      case 'remote_connected':
        connectionDot.classList.add('connection-dot--connected');
        showToast('Remote Connected', 'Mobile controller active', 'success');
        break;

      case 'remote_disconnected':
      case 'connected':
        // Yellow/orange waiting state
        showToast('Remote Disconnected', 'Waiting for mobile controller...', 'warning');
        break;

      case 'reconnecting':
        showToast('Connection Warning', message, 'warning');
        break;

      case 'expired':
      case 'rejected':
      case 'failed':
        connectionDot.classList.add('connection-dot--disconnected');
        showToast('Connection Error', message, 'error');
        setTimeout(() => {
          alert(`Presentation session error: ${message}`);
          window.location.href = '/';
        }, 3000);
        break;
    }
  }

  // ── Helper Utilities ──
  function showCommandFeedback(text) {
    // Show a subtle pill or toast for remote action confirmation
    showToast('Remote Action', text, 'info');
  }

  function showLoadingError(msg) {
    loadingOverlay.style.display = 'flex';
    loadingOverlay.innerHTML = `
      <div style="font-size: 2.5rem; color: var(--error);">⚠️</div>
      <div style="color: var(--text-primary); font-size: 1.2rem; font-weight: 600;">${escapeHtml(msg)}</div>
      <a href="/" class="btn-primary" style="margin-top: 1rem; width: auto;">Return to Home</a>
    `;
  }

  function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠️', info: 'ℹ️' };

    toast.innerHTML = `
      <div class="toast__icon">${icons[type] || 'ℹ️'}</div>
      <div>
        <div class="toast__title">${escapeHtml(title)}</div>
        <div class="toast__msg">${escapeHtml(message)}</div>
      </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});

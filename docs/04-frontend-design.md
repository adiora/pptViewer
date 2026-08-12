# PPT Viewer — Frontend Design

## 1. Page Architecture

The frontend consists of **two HTML pages** served as static files by Express:

| Page | URL | Purpose |
|------|-----|---------|
| `index.html` | `/` | Upload page — file selection, upload progress, session code display |
| `viewer.html` | `/viewer.html?code=XXXXXX` | Slide viewer — fullscreen PDF rendering, navigation, remote control listener |

---

## 2. Design System (`css/styles.css`)

### 2.1 CSS Custom Properties (Design Tokens)

```css
:root {
  /* ── Colors (Dark Theme) ── */
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a2e;
  --bg-card-hover: #222240;
  --surface-glass: rgba(255, 255, 255, 0.05);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-accent: rgba(99, 102, 241, 0.4);

  --text-primary: #f0f0f5;
  --text-secondary: #8888a0;
  --text-muted: #55556a;

  --accent-primary: #6366f1;        /* Indigo */
  --accent-primary-hover: #818cf8;
  --accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
  --accent-glow: 0 0 30px rgba(99, 102, 241, 0.3);

  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;

  /* ── Typography ── */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* ── Spacing ── */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;

  /* ── Transitions ── */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 2.2 Global Styles

- Import Google Font: `Inter` (400, 500, 600, 700) and `JetBrains Mono` (400)
- `*` box-sizing: border-box, margin/padding reset
- `body`: dark background (`--bg-primary`), font-family, antialiased text
- `::selection`: accent-colored text selection
- Smooth scrolling on `html`

### 2.3 Component Classes

| Class | Description |
|-------|-------------|
| `.card` | Glassmorphism card: `--bg-card`, subtle border, `backdrop-filter: blur(10px)`, rounded corners, box-shadow |
| `.btn-primary` | Gradient button (`--accent-gradient`), white text, glow on hover, scale(1.02) on hover, disabled state |
| `.btn-secondary` | Outlined button, transparent bg, accent border, accent text |
| `.input-field` | Dark input with subtle border, focus glow ring, placeholder color |
| `.progress-bar` | Animated progress bar with gradient fill and shimmer animation |
| `.code-display` | Large monospace code display with background, letter-spacing: 0.3em, copy button |
| `.badge` | Small pill badge for status indicators |
| `.slide-counter` | Floating pill showing "3 / 15" with glassmorphism |
| `.toast` | Slide-in notification for success/error messages |
| `.drop-zone` | Dashed border area for drag-and-drop, animated border on dragover |
| `.nav-arrow` | Semi-transparent arrow buttons for prev/next slide |
| `.loading-spinner` | CSS-only spinning loader with accent gradient |
| `.connection-dot` | Pulsing green/red dot for connection status |

### 2.4 Animations

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(99, 102, 241, 0.3); }
  50% { box-shadow: 0 0 25px rgba(99, 102, 241, 0.6); }
}

@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes dot-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
}
```

---

## 3. Upload Page (`index.html`)

### 3.1 Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│                        HEADER                                │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  ✦ PPT Viewer                                       │    │
│   │  Present from your browser, control from your phone │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │                                                     │    │
│   │             ┌─────────────────────┐                 │    │
│   │             │                     │                 │    │
│   │             │   📁 Drop Zone      │                 │    │
│   │             │                     │                 │    │
│   │             │  Drop your .pptx    │                 │    │
│   │             │  file here or       │                 │    │
│   │             │  [Browse Files]     │                 │    │
│   │             │                     │                 │    │
│   │             └─────────────────────┘                 │    │
│   │                                                     │    │
│   │  Selected: presentation.pptx (2.4 MB)              │    │
│   │                                                     │    │
│   │  ┌──────────────────────────────────────────┐       │    │
│   │  │  ████████████████████░░░░░░░░░ 65%       │       │    │
│   │  └──────────────────────────────────────────┘       │    │
│   │                                                     │    │
│   │             [ Upload & Generate Code ]              │    │
│   │                                                     │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │              SESSION CREATED ✓                      │    │
│   │                                                     │    │
│   │        Your Session Code:                           │    │
│   │                                                     │    │
│   │         ┌──────────────────────┐                    │    │
│   │         │   A 3 F 9 K 2        │  [📋 Copy]       │    │
│   │         └──────────────────────┘                    │    │
│   │                                                     │    │
│   │  Share this code with your mobile device            │    │
│   │  15 slides • Expires in 24 hours                    │    │
│   │                                                     │    │
│   │         [ ▶ Start Presenting ]                      │    │
│   │                                                     │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  HOW IT WORKS                                       │    │
│   │  1. Upload your .pptx file                          │    │
│   │  2. Share the 6-digit code with your phone          │    │
│   │  3. Open the mobile app & enter the code            │    │
│   │  4. Control slides with volume buttons              │    │
│   │     Vol+ = Next | Vol- = Prev | Both = Play Video   │    │
│   └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 HTML Structure

```html
<!-- Key semantic structure -->
<body>
  <header>
    <h1>PPT Viewer</h1>
    <p class="subtitle">Present from your browser, control from your phone</p>
  </header>

  <main>
    <!-- Upload Section -->
    <section id="upload-section" class="card">
      <div id="drop-zone" class="drop-zone">
        <input type="file" id="file-input" accept=".ppt,.pptx" hidden>
        <div class="drop-zone__content">
          <span class="drop-zone__icon">📁</span>
          <p>Drop your .pptx file here</p>
          <button id="browse-btn" class="btn-secondary">Browse Files</button>
        </div>
      </div>
      <div id="file-info" class="file-info" hidden>
        <span id="file-name"></span>
        <span id="file-size"></span>
      </div>
      <div id="progress-container" hidden>
        <div class="progress-bar">
          <div id="progress-fill" class="progress-bar__fill"></div>
        </div>
        <span id="progress-text">0%</span>
      </div>
      <button id="upload-btn" class="btn-primary" disabled>
        Upload & Generate Code
      </button>
    </section>

    <!-- Session Code Section (hidden until upload completes) -->
    <section id="code-section" class="card" hidden>
      <div class="success-badge">✓ Session Created</div>
      <p>Your Session Code:</p>
      <div class="code-display">
        <span id="session-code"></span>
        <button id="copy-btn" class="btn-icon" title="Copy code">📋</button>
      </div>
      <p class="meta" id="session-meta"></p>
      <a id="start-btn" class="btn-primary" href="#">▶ Start Presenting</a>
    </section>

    <!-- How It Works -->
    <section class="card how-it-works">
      <!-- Steps 1-4 with icons -->
    </section>
  </main>
</body>
```

### 3.3 IDs for Interactive Elements

| ID | Element | Purpose |
|----|---------|---------|
| `file-input` | `<input type="file">` | Hidden file input |
| `drop-zone` | `<div>` | Drag-and-drop area |
| `browse-btn` | `<button>` | Trigger file picker |
| `file-name` | `<span>` | Display selected filename |
| `file-size` | `<span>` | Display file size |
| `progress-container` | `<div>` | Progress bar wrapper |
| `progress-fill` | `<div>` | Progress bar fill element |
| `progress-text` | `<span>` | "65%" text |
| `upload-btn` | `<button>` | Upload trigger |
| `code-section` | `<section>` | Session code card |
| `session-code` | `<span>` | Rendered code text |
| `copy-btn` | `<button>` | Copy code to clipboard |
| `session-meta` | `<p>` | "15 slides • Expires in 24h" |
| `start-btn` | `<a>` | Link to viewer.html?code=X |

---

## 4. Viewer Page (`viewer.html`)

### 4.1 Page Layout

```
┌────────────────────────────────────────────────────────────┐
│  [Full black background]                                   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │                                                      │  │
│  │                                                      │  │
│  │                  SLIDE CANVAS                        │  │
│  │                  (PDF.js render)                     │  │
│  │                                                      │  │
│  │                                                      │  │
│  │                                                      │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ◀  (left arrow, semi-transparent)       ▶  (right arrow)  │
│                                                            │
│        ┌──────────────┐       ┌─────────────────┐          │
│        │  3 / 15      │       │ 🟢 Remote       │          │
│        └──────────────┘       │    Connected     │          │
│         (slide counter)       └─────────────────┘          │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Code: A3F9K2  │  ⛶ Fullscreen  │  🏠 Back        │   │
│  └─────────────────────────────────────────────────────┘   │
│           (bottom toolbar, auto-hides after 3s)            │
└────────────────────────────────────────────────────────────┘
```

### 4.2 HTML Structure

```html
<body class="viewer-body">
  <!-- Slide Container -->
  <div id="slide-container">
    <canvas id="slide-canvas"></canvas>

    <!-- Video Overlay (shown when slide has embedded video) -->
    <div id="video-overlay" hidden>
      <video id="slide-video" controls></video>
    </div>
  </div>

  <!-- Navigation Arrows (visible on hover) -->
  <button id="prev-arrow" class="nav-arrow nav-arrow--left" title="Previous Slide">‹</button>
  <button id="next-arrow" class="nav-arrow nav-arrow--right" title="Next Slide">›</button>

  <!-- Slide Counter (floating pill) -->
  <div id="slide-counter" class="slide-counter">
    <span id="current-slide">1</span> / <span id="total-slides">15</span>
  </div>

  <!-- Connection Status -->
  <div id="connection-status" class="connection-status">
    <span class="connection-dot"></span>
    <span id="connection-text">Waiting for remote...</span>
  </div>

  <!-- Bottom Toolbar (auto-hides) -->
  <div id="toolbar" class="toolbar">
    <span id="toolbar-code" class="toolbar__code">Code: A3F9K2</span>
    <button id="fullscreen-btn" class="btn-secondary btn-sm">⛶ Fullscreen</button>
    <a id="back-btn" href="/" class="btn-secondary btn-sm">🏠 Back</a>
  </div>

  <!-- Toast Notifications -->
  <div id="toast-container" class="toast-container"></div>
</body>
```

### 4.3 Viewer Behaviors

| Behavior | Trigger | Action |
|----------|---------|--------|
| Navigate next | Right arrow key, click right arrow, WS `NEXT_SLIDE` command | Render next PDF page on canvas |
| Navigate prev | Left arrow key, click left arrow, WS `PREV_SLIDE` command | Render previous PDF page on canvas |
| Fullscreen | `F` key, click fullscreen button | `document.documentElement.requestFullscreen()` |
| Exit fullscreen | `Escape` key | `document.exitFullscreen()` |
| Play video | WS `PLAY_VIDEO` command | Toggle play/pause on `#slide-video` if visible |
| Auto-hide toolbar | Mouse idle 3 seconds | Add `.toolbar--hidden` class (opacity: 0, pointer-events: none) |
| Show toolbar | Mouse movement | Remove `.toolbar--hidden`, reset 3s timer |
| Show nav arrows | Mouse hover on left/right edges | Fade in corresponding arrow |
| Connection toast | WS `PEER_CONNECTED` / `PEER_DISCONNECTED` | Show toast notification |

### 4.4 IDs for Interactive Elements

| ID | Element | Purpose |
|----|---------|---------|
| `slide-container` | `<div>` | Slide viewport |
| `slide-canvas` | `<canvas>` | PDF.js rendering target |
| `video-overlay` | `<div>` | Video player overlay |
| `slide-video` | `<video>` | Video element for embedded videos |
| `prev-arrow` | `<button>` | Previous slide navigation |
| `next-arrow` | `<button>` | Next slide navigation |
| `slide-counter` | `<div>` | Floating slide number pill |
| `current-slide` | `<span>` | Current slide number |
| `total-slides` | `<span>` | Total slide count |
| `connection-status` | `<div>` | Remote connection indicator |
| `connection-text` | `<span>` | "Remote Connected" / "Waiting..." |
| `toolbar` | `<div>` | Bottom toolbar |
| `toolbar-code` | `<span>` | Session code display |
| `fullscreen-btn` | `<button>` | Toggle fullscreen |
| `back-btn` | `<a>` | Return to upload page |
| `toast-container` | `<div>` | Toast notification container |

---

## 5. JavaScript Modules

### 5.1 Upload Module (`js/upload.js`)

```
RESPONSIBILITIES:
- Handle drag-and-drop events on #drop-zone
- Handle file selection from #file-input
- Validate file client-side (type, size)
- Upload file via XMLHttpRequest (for progress tracking)
- Display upload progress
- On success: show session code, enable "Start Presenting" link
- Copy code to clipboard on #copy-btn click
- Handle upload errors with user-friendly messages

FUNCTIONS:

  initUpload()
    → Set up event listeners for drop-zone, file-input, browse-btn, upload-btn
    → Called on DOMContentLoaded

  handleFileSelect(file)
    → Validate: file.type in allowed MIME types
    → Validate: file.size ≤ 50 MB
    → Show file name and size in #file-info
    → Enable #upload-btn

  handleUpload()
    → Disable #upload-btn, show #progress-container
    → Create FormData with selected file
    → Send via XMLHttpRequest to POST /api/upload
    → Listen to xhr.upload.onprogress → update progress bar
    → On success (201):
      → Parse response JSON { code, slideCount, expiresAt }
      → Hide #upload-section (or keep visible)
      → Show #code-section
      → Set #session-code textContent = code (with letter spacing)
      → Set #session-meta = "{slideCount} slides • Expires in 24 hours"
      → Set #start-btn href = "/viewer.html?code={code}"
    → On error:
      → Show toast with error message
      → Re-enable #upload-btn

  copyCode()
    → navigator.clipboard.writeText(code)
    → Show brief "Copied!" feedback on #copy-btn

  formatFileSize(bytes)
    → Return human-readable size string (e.g., "2.4 MB")

DRAG-AND-DROP EVENTS:
  #drop-zone.addEventListener('dragover', ...)   → preventDefault, add .dragover class
  #drop-zone.addEventListener('dragleave', ...)  → remove .dragover class
  #drop-zone.addEventListener('drop', ...)       → preventDefault, extract file, call handleFileSelect
```

### 5.2 Viewer Module (`js/viewer.js`)

```
RESPONSIBILITIES:
- Parse ?code= from URL query string
- Fetch PDF from GET /api/slides/:code
- Initialize PDF.js and render slides
- Handle keyboard navigation (ArrowLeft, ArrowRight, F, Escape)
- Handle mouse click navigation (prev/next arrows)
- Manage fullscreen toggle
- Handle video playback commands
- Auto-hide toolbar on mouse idle
- Expose functions for WebSocket command handler to call

STATE:
  let pdfDoc = null;           // PDF.js document object
  let currentPage = 1;         // Current slide number (1-indexed)
  let totalPages = 0;          // Total slides
  let isRendering = false;     // Prevent concurrent renders
  let toolbarTimer = null;     // Auto-hide timer
  let scale = 1;               // Render scale (calculated to fit viewport)

FUNCTIONS:

  initViewer()
    → Parse code from URL: new URLSearchParams(window.location.search).get('code')
    → If no code → redirect to /
    → Load PDF.js library (from CDN)
    → Fetch PDF: pdfjsLib.getDocument('/api/slides/' + code)
    → On load:
      → Set pdfDoc, totalPages
      → Update #total-slides
      → Render first slide
      → Initialize WebSocket connection (from websocket-client.js)
      → Set up keyboard listeners
      → Set up mouse listeners for toolbar auto-hide
    → On error: show error toast, redirect to /

  renderSlide(pageNumber)
    → Guard: if isRendering, return (debounce)
    → Guard: if pageNumber < 1 or > totalPages, return
    → Set isRendering = true
    → Get page: pdfDoc.getPage(pageNumber)
    → Calculate scale to fit canvas in viewport while maintaining aspect ratio:
      → scale = Math.min(
          window.innerWidth / viewport.width,
          window.innerHeight / viewport.height
        )
    → Set canvas dimensions
    → Render page to canvas context
    → Update currentPage = pageNumber
    → Update #current-slide text
    → Set isRendering = false
    → Send SLIDE_UPDATE via WebSocket

  nextSlide()
    → if currentPage < totalPages → renderSlide(currentPage + 1)

  prevSlide()
    → if currentPage > 1 → renderSlide(currentPage - 1)

  toggleFullscreen()
    → if document.fullscreenElement → document.exitFullscreen()
    → else → document.documentElement.requestFullscreen()
    → After transition: re-render current slide (viewport may have changed)

  playVideo()
    → Find #slide-video element
    → If video.paused → video.play()
    → Else → video.pause()
    → Note: Video elements on slides are a stretch goal; the main use case is
      controlling an embedded <video> tag that the user may have placed
      adjacent to the slide canvas.

  handleKeydown(event)
    → ArrowRight or Space → nextSlide()
    → ArrowLeft → prevSlide()
    → 'f' or 'F' → toggleFullscreen()
    → Escape → exit fullscreen (handled by browser)

  setupToolbarAutoHide()
    → On mousemove: show toolbar, clear timer, set 3s hide timer
    → On toolbar hover: keep visible
    → Initially hidden after 3s

RESPONSIVE RENDERING:
  window.addEventListener('resize', () => renderSlide(currentPage))
  → Re-calculate scale on viewport change (especially fullscreen toggle)
```

### 5.3 WebSocket Client Module (`js/websocket-client.js`)

```
RESPONSIBILITIES:
- Connect to WS server as presenter
- Handle incoming COMMAND messages → dispatch to viewer functions
- Handle PEER_CONNECTED / PEER_DISCONNECTED → update UI, show toast
- Send SLIDE_UPDATE when slide changes
- Auto-reconnect with exponential backoff on disconnection
- Handle SESSION_EXPIRED message

STATE:
  let ws = null;                    // WebSocket instance
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000;  // 1 second
  let commandCallback = null;       // Set by viewer.js

FUNCTIONS:

  connect(code)
    → Determine WS URL:
      → const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      → const url = `${protocol}//${location.host}/ws?code=${code}&role=presenter`
    → Create new WebSocket(url)
    → ws.onopen: reset reconnectAttempts, log connected
    → ws.onmessage: parseMessage(event.data)
    → ws.onclose: handleDisconnect(event)
    → ws.onerror: log error

  parseMessage(data)
    → Parse JSON
    → Switch on message.type:
      → "JOINED": log, update connection status
      → "COMMAND": dispatch to viewer
        → if action === "NEXT_SLIDE" → viewer.nextSlide()
        → if action === "PREV_SLIDE" → viewer.prevSlide()
        → if action === "PLAY_VIDEO" → viewer.playVideo()
      → "PEER_CONNECTED": update #connection-status to green + "Remote Connected", show toast
      → "PEER_DISCONNECTED": update #connection-status to orange + "Remote Disconnected", show toast
      → "SESSION_EXPIRED": show modal/toast, redirect to / after 3s
      → "ERROR": show toast with message

  sendSlideUpdate(currentSlide, totalSlides)
    → If ws.readyState !== WebSocket.OPEN, return
    → ws.send(JSON.stringify({
        type: "SLIDE_UPDATE",
        currentSlide,
        totalSlides
      }))

  handleDisconnect(event)
    → If event.code === 4001-4005 (server rejection), don't reconnect, show error
    → If event.code === 1000 (normal), don't reconnect
    → Otherwise: attempt reconnect
      → if reconnectAttempts < MAX_RECONNECT_ATTEMPTS
      → delay = BASE_RECONNECT_DELAY * 2^reconnectAttempts (capped at 30s)
      → setTimeout(() => connect(code), delay)
      → reconnectAttempts++
      → Update UI: "Reconnecting..."

  disconnect()
    → ws.close(1000)
```

---

## 6. PDF.js Integration

### CDN Inclusion (in `viewer.html`)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs" type="module"></script>
```

Or for non-module setup:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';
</script>
```

### Rendering Pipeline

```javascript
// 1. Load document
const loadingTask = pdfjsLib.getDocument(pdfUrl);
const pdfDoc = await loadingTask.promise;

// 2. Get page
const page = await pdfDoc.getPage(pageNumber);  // 1-indexed

// 3. Calculate scale to fit viewport
const unscaledViewport = page.getViewport({ scale: 1 });
const scale = Math.min(
  window.innerWidth / unscaledViewport.width,
  window.innerHeight / unscaledViewport.height
);
const viewport = page.getViewport({ scale });

// 4. Set canvas dimensions
canvas.height = viewport.height;
canvas.width = viewport.width;

// 5. Render
const renderContext = {
  canvasContext: canvas.getContext('2d'),
  viewport: viewport,
};
await page.render(renderContext).promise;
```

---

## 7. Responsive Design

### Breakpoints

```css
/* Mobile-first, but viewer is optimized for desktop/projector */
@media (max-width: 768px) {
  /* Upload page: stack layout, full-width cards */
  .card { margin: 1rem; padding: 1.5rem; }
  .drop-zone { padding: 2rem; }
  .code-display { font-size: 1.8rem; }
}

@media (min-width: 769px) {
  /* Upload page: centered cards, max-width 600px */
  main { max-width: 600px; margin: 0 auto; }
}

/* Viewer page: always full viewport */
.viewer-body {
  overflow: hidden;
  width: 100vw;
  height: 100vh;
}
```

### Canvas Sizing Strategy

The slide canvas is always sized to fill the viewport while maintaining the PDF page's aspect ratio:
- Calculate scale based on `window.innerWidth` and `window.innerHeight`
- Center canvas both vertically and horizontally using flexbox
- Re-render on `window.resize` event and fullscreen toggle

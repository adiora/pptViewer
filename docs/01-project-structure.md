# PPT Viewer — Project Structure

## Complete File Tree

```
pptViewer/
│
├── docs/                                  # Architecture & design documents
│   ├── 00-overview.md
│   ├── 01-project-structure.md            # ← You are here
│   ├── 02-backend-design.md
│   ├── 03-api-and-websocket-spec.md
│   ├── 04-frontend-design.md
│   ├── 05-mobile-app-design.md
│   └── 06-security-and-cleanup.md
│
├── server/                                # ── NODE.JS BACKEND ──
│   ├── package.json                       # Dependencies & scripts
│   ├── .env.example                       # Environment variable template
│   ├── server.js                          # Entry point: Express + WS bootstrap
│   │
│   ├── config/
│   │   └── index.js                       # Centralized configuration from env vars
│   │
│   ├── routes/
│   │   └── upload.js                      # POST /api/upload, GET /api/slides/:code,
│   │                                      # GET /api/session/:code
│   │
│   ├── services/
│   │   ├── converter.js                   # PPTX → PDF via LibreOffice headless
│   │   ├── sessionManager.js              # In-memory session CRUD, code generation
│   │   └── cleanup.js                     # Cron-based 24h file + session cleanup
│   │
│   ├── websocket/
│   │   └── handler.js                     # WS upgrade, room routing, message relay
│   │
│   ├── middleware/
│   │   ├── rateLimiter.js                 # express-rate-limit config per route
│   │   └── validation.js                  # File type/size validation middleware
│   │
│   └── uploads/                           # Temporary storage (gitignored)
│       └── .gitkeep
│
├── frontend/                              # ── WEB FRONTEND ──
│   ├── index.html                         # Landing / upload page
│   ├── viewer.html                        # Slide viewer page
│   │
│   ├── css/
│   │   └── styles.css                     # Complete design system + page styles
│   │
│   ├── js/
│   │   ├── upload.js                      # File upload logic, code display
│   │   ├── viewer.js                      # PDF.js slide rendering, navigation,
│   │   │                                  # fullscreen, video detection
│   │   └── websocket-client.js            # WS connection, command handler
│   │
│   └── assets/
│       └── favicon.ico                    # App favicon
│
├── mobile/                                # ── FLUTTER MOBILE APP ──
│   └── ppt_remote/
│       ├── pubspec.yaml                   # Flutter dependencies
│       ├── analysis_options.yaml          # Lint rules
│       │
│       ├── lib/
│       │   ├── main.dart                  # App entry, MaterialApp, routing
│       │   │
│       │   ├── screens/
│       │   │   ├── connect_screen.dart    # Code input UI, server URL config
│       │   │   └── remote_screen.dart     # Connected state, slide info display,
│       │   │                              # manual fallback buttons
│       │   │
│       │   ├── services/
│       │   │   ├── websocket_service.dart # WS connection, send/receive messages
│       │   │   └── volume_button_service.dart  # Hardware volume interception,
│       │   │                              # simultaneous press detection
│       │   │
│       │   ├── models/
│       │   │   └── command.dart           # Command enum & JSON serialization
│       │   │
│       │   └── utils/
│       │       └── constants.dart         # Timeout values, debounce durations
│       │
│       ├── android/
│       │   └── app/src/main/
│       │       └── kotlin/.../
│       │           └── MainActivity.kt   # Volume key override via MethodChannel
│       │
│       └── ios/
│           └── Runner/
│               └── AppDelegate.swift      # Volume key override (iOS-specific)
│
├── .gitignore                             # Ignore node_modules, uploads/*, etc.
└── README.md                              # Setup & run instructions
```

---

## File Responsibilities (Detailed)

### Server (`server/`)

| File | Responsibility | Key Exports / Functions |
|------|---------------|------------------------|
| `server.js` | Bootstrap Express app, attach WS server to HTTP server, serve static frontend files, start cleanup cron, listen on `PORT` | — (entry point) |
| `config/index.js` | Read environment variables, export typed config object with defaults | `config` object: `{ port, uploadDir, maxFileSize, sessionTTL, allowedOrigins, libreOfficePath }` |
| `routes/upload.js` | Express Router: handle multipart upload, trigger conversion, create session, serve PDF files, validate session codes | `router` with 3 route handlers |
| `services/converter.js` | Spawn LibreOffice headless as child process, convert `.pptx` → `.pdf`, extract page count from PDF | `convertToPDF(inputPath): Promise<{ pdfPath, pageCount }>` |
| `services/sessionManager.js` | Manage `Map<code, session>` — create, get, delete, list expired, generate unique 6-char codes | `createSession()`, `getSession(code)`, `deleteSession(code)`, `getExpiredSessions()`, `generateCode()` |
| `services/cleanup.js` | `node-cron` job that runs every 30 minutes, finds expired sessions, deletes files, closes WS connections, removes sessions | `startCleanupScheduler()` |
| `websocket/handler.js` | Handle WS `upgrade` event, parse `code` + `role` from URL params, manage rooms (Map of code → { presenter, controllers[] }), relay commands from controller→presenter, relay slide updates from presenter→controllers | `initWebSocket(server, sessionManager)` |
| `middleware/rateLimiter.js` | Configure `express-rate-limit` — stricter for uploads (5/min), moderate for API reads (30/min) | `uploadLimiter`, `apiLimiter` middleware |
| `middleware/validation.js` | Multer config with file filter (`.ppt`, `.pptx` only), size limit (50 MB), sanitize filename | `upload` multer instance |

### Frontend (`frontend/`)

| File | Responsibility | Key Functions / Behavior |
|------|---------------|--------------------------|
| `index.html` | Upload page: drag-and-drop zone, file picker, upload progress bar, session code display with copy button, "Start Viewing" link | — |
| `viewer.html` | Viewer page: fullscreen canvas for slides, floating slide counter, navigation arrows (mouse/keyboard fallback), video overlay controls | — |
| `css/styles.css` | Design system: CSS custom properties (colors, spacing, typography), dark theme, page layouts, component styles (buttons, cards, modals, progress bars), responsive breakpoints, animations | — |
| `js/upload.js` | `fetch()` POST to `/api/upload`, show progress via `XMLHttpRequest`, display returned code, copy-to-clipboard, redirect to viewer | `handleUpload()`, `copyCode()` |
| `js/viewer.js` | Initialize PDF.js, render pages to `<canvas>`, track current slide index, keyboard navigation (←/→/F for fullscreen), handle COMMAND messages from WS, detect `<video>` elements in slides and control playback | `renderSlide(n)`, `nextSlide()`, `prevSlide()`, `toggleFullscreen()`, `playVideo()` |
| `js/websocket-client.js` | Connect to `ws://host/ws?code=X&role=presenter`, parse incoming JSON commands, dispatch to viewer functions, send `SLIDE_UPDATE` on navigation, reconnect with exponential backoff | `connect(code)`, `send(msg)`, `onCommand(callback)` |

### Mobile App (`mobile/ppt_remote/`)

| File | Responsibility | Key Functions / Behavior |
|------|---------------|--------------------------|
| `main.dart` | `MaterialApp` with named routes: `/connect` and `/remote`. Theme setup (dark mode). | — |
| `screens/connect_screen.dart` | Text field for 6-char code input, server URL field (with default), "Connect" button, input validation, loading state | `_connectToSession()` |
| `screens/remote_screen.dart` | Connected status display, current slide number / total, manual Next/Prev/Play buttons as fallback, connection status indicator, disconnect button | `_onCommand(Command)` |
| `services/websocket_service.dart` | `WebSocketChannel` from `web_socket_channel` package, connect with code + role=controller, send JSON commands, listen for SLIDE_SYNC messages, auto-reconnect, heartbeat ping | `connect(url, code)`, `sendCommand(Command)`, `disconnect()`, `Stream<Message> messages` |
| `services/volume_button_service.dart` | Platform channel to intercept volume HW events, debounced detection logic for simultaneous press (both within 300ms → PLAY_VIDEO), single press after 300ms timeout → NEXT or PREV | `Stream<Command> commands`, `dispose()` |
| `models/command.dart` | Enum: `nextSlide`, `prevSlide`, `playVideo`. JSON serialization: `toJson()`, `fromJson()` | `Command` enum |
| `utils/constants.dart` | `simultaneousPressWindow = 300ms`, `reconnectDelay = 2s`, `maxReconnectAttempts = 10`, `heartbeatInterval = 30s` | Constants |
| `MainActivity.kt` | Override `dispatchKeyEvent()` to capture `KEYCODE_VOLUME_UP` / `KEYCODE_VOLUME_DOWN`, forward to Flutter via `MethodChannel`, return `true` to suppress system volume UI | — |
| `AppDelegate.swift` | Override volume button capture for iOS using `AVAudioSession` route change or `MPRemoteCommandCenter` | — |

---

## Dependency Summary

### Server (`server/package.json`)

```json
{
  "name": "ppt-viewer-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "ws": "^8.16.0",
    "multer": "^1.4.5-lts.1",
    "node-cron": "^3.0.0",
    "express-rate-limit": "^7.1.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

### Mobile (`mobile/ppt_remote/pubspec.yaml`)

```yaml
dependencies:
  flutter:
    sdk: flutter
  web_socket_channel: ^2.4.0
  provider: ^6.1.0          # State management
  flutter_secure_storage: ^9.0.0  # Store server URL
```

### Frontend (CDN)

| Library | CDN Source | Version |
|---------|----------|---------|
| PDF.js | `cdnjs.cloudflare.com/ajax/libs/pdf.js/` | 4.x |

---

## `.gitignore`

```gitignore
# Server
server/node_modules/
server/uploads/*
!server/uploads/.gitkeep
server/.env

# Mobile
mobile/ppt_remote/.dart_tool/
mobile/ppt_remote/build/
mobile/ppt_remote/.flutter-plugins
mobile/ppt_remote/.flutter-plugins-dependencies
mobile/ppt_remote/.packages

# IDE
.idea/
.vscode/
*.swp
.DS_Store
```

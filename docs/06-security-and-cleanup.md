# PPT Viewer — Security & Cleanup

## 1. Threat Model

| Threat | Attack Surface | Severity | Mitigation |
|--------|---------------|----------|------------|
| **Malicious file upload** | `POST /api/upload` | High | File type validation (extension + MIME + magic bytes), size limit, LibreOffice sandboxing |
| **Path traversal** | File serving endpoints | High | UUID-based filenames, no user-controlled paths in `fs` calls |
| **Session code brute-force** | `GET /api/session/:code`, WS connect | Medium | Rate limiting, 6-char code from 29-char set (>500M combinations) |
| **Denial of Service (upload flood)** | `POST /api/upload` | Medium | Rate limiting (10/15min), file size limit (50MB), cleanup cron |
| **WebSocket abuse** | WS connection | Medium | Code validation, role validation, max controllers limit, message type whitelist |
| **XSS via filename** | Frontend display | Low | Never render original filename as HTML; use `textContent` |
| **Disk exhaustion** | Upload storage | Medium | File size limit, 24h TTL with cron cleanup, max concurrent sessions (optional) |
| **Man-in-the-middle** | All network traffic | High (prod) | HTTPS/WSS in production (reverse proxy with TLS) |
| **Unauthorized slide access** | `GET /api/slides/:code` | Low | Code acts as bearer token; expire after 24h |

---

## 2. Security Measures

### 2.1 HTTP Security Headers (Helmet.js)

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],  // PDF.js CDN
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],  // WebSocket
      workerSrc: ["'self'", "blob:"],         // PDF.js web worker
    },
  },
  crossOriginEmbedderPolicy: false,  // Required for PDF.js WASM worker
  crossOriginOpenerPolicy: false,
}));
```

### 2.2 CORS Configuration

```javascript
const cors = require('cors');

const corsOptions = {
  origin: config.allowedOrigins,  // ['http://localhost:3000'] in dev
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,  // Cache preflight for 24h
};

app.use(cors(corsOptions));
```

**Note:** In production behind a reverse proxy, set `allowedOrigins` to the actual domain. For local network use (LAN presentations), you may need to allow the server's LAN IP.

### 2.3 File Upload Security — Defense in Depth

```
Layer 1: Client-side validation
  → JavaScript checks file extension before upload
  → Informational only (can be bypassed)

Layer 2: Multer file filter
  → Check MIME type: application/vnd.ms-powerpoint,
    application/vnd.openxmlformats-officedocument.presentationml.presentation,
    application/pdf
  → Check extension: .ppt, .pptx, .pdf
  → Reject if neither matches

Layer 3: Magic byte verification (post-upload)
  → Read first bytes of saved file
  → .pptx: Must start with 0x50 0x4B (ZIP/PK header)
  → .ppt: Must start with 0xD0 0xCF 0x11 0xE0 (OLE2 Compound Document)
  → .pdf: Must start with 0x25 0x50 0x44 0x46 0x2D (%PDF-)
  → Delete file immediately if magic bytes don't match

Layer 4: UUID filename
  → Original filename is NEVER used in the filesystem
  → File saved as: {uuid}.pptx → converted to {uuid}.pdf
  → Prevents path traversal, name collisions, and special character issues

Layer 5: LibreOffice isolation (PPT/PPTX only — PDFs bypass conversion)
  → LibreOffice runs headless with minimal permissions
  → Conversion timeout: 60 seconds (kill process if exceeded)
  → Output constrained to uploads directory
```

### 2.4 WebSocket Security

```
1. Connection validation:
   → Code must match an active session
   → Role must be "presenter" or "controller"
   → Max 1 presenter per session
   → Max 5 controllers per session

2. Message validation:
   → All messages must be valid JSON
   → Message type must be in whitelist: ["COMMAND", "SLIDE_UPDATE"]
   → COMMAND action must be in whitelist: ["NEXT_SLIDE", "PREV_SLIDE", "PLAY_VIDEO"]
   → SLIDE_UPDATE fields must be positive integers
   → Reject and log any unknown message types

3. Role enforcement:
   → Controllers can only send COMMAND messages
   → Presenters can only send SLIDE_UPDATE messages
   → Server enforces this — rejects cross-role messages with ERROR

4. Message size limit:
   → Reject any WS message > 1 KB (all valid messages are tiny JSON)

5. Connection limits:
   → Max WebSocket connections per IP: 10 (prevents resource exhaustion)
```

### 2.5 Rate Limiting

```javascript
// Upload: strict
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 uploads per IP per window
  message: { error: 'Too many uploads. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,  // Rate limit by IP
});

// Session validation: moderate (mobile app may poll)
const sessionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max: 30,                    // 30 checks per minute
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to specific routes
router.post('/upload', uploadLimiter, ...);
router.get('/session/:code', sessionLimiter, ...);
```

### 2.6 Input Sanitization

```javascript
// Session code validation middleware
function validateCode(req, res, next) {
  const { code } = req.params;
  // Only allow characters from the code charset (no 0, 1, I, L, O)
  const codeRegex = /^[A-HJ-NP-Z2-9]{6}$/;
  if (!codeRegex.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }
  next();
}

// Apply to routes
router.get('/slides/:code', validateCode, ...);
router.get('/session/:code', validateCode, ...);
```

---

## 3. File Cleanup Strategy

### 3.1 Cron-Based Cleanup

```javascript
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

function startCleanupScheduler(sessionManager) {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[CLEANUP] Starting scheduled cleanup...');

    const expired = sessionManager.getExpiredSessions();
    let cleaned = 0;

    for (const session of expired) {
      try {
        // 1. Close WebSocket connections gracefully
        if (session.presenterWs) {
          session.presenterWs.send(JSON.stringify({
            type: 'SESSION_EXPIRED',
            message: 'Session has expired after 24 hours',
          }));
          session.presenterWs.close(1000, 'Session expired');
        }
        for (const controller of session.controllerWs) {
          controller.send(JSON.stringify({
            type: 'SESSION_EXPIRED',
            message: 'Session has expired after 24 hours',
          }));
          controller.close(1000, 'Session expired');
        }

        // 2. Delete files
        await safeDelete(session.pptxPath);
        await safeDelete(session.pdfPath);

        // 3. Remove session from store
        sessionManager.deleteSession(session.code);

        cleaned++;
        console.log(`[CLEANUP] Removed session ${session.code}`);
      } catch (err) {
        console.error(`[CLEANUP] Error cleaning session ${session.code}:`, err);
        // Continue with other sessions
      }
    }

    console.log(`[CLEANUP] Complete: ${cleaned}/${expired.length} sessions removed`);
  });
}

async function safeDelete(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;  // Re-throw if not "file not found"
    }
    // File already deleted — that's fine
  }
}
```

### 3.2 Startup Cleanup

On server start, scan the uploads directory for orphaned files (files without a corresponding session — can happen if the server crashed):

```javascript
async function cleanupOrphanedFiles(sessionManager, uploadDir) {
  const files = await fs.readdir(uploadDir);
  const activePaths = new Set();

  for (const session of sessionManager.getAllSessions()) {
    activePaths.add(path.basename(session.pptxPath));
    activePaths.add(path.basename(session.pdfPath));
  }

  for (const file of files) {
    if (file === '.gitkeep') continue;
    if (!activePaths.has(file)) {
      await safeDelete(path.join(uploadDir, file));
      console.log(`[CLEANUP] Removed orphaned file: ${file}`);
    }
  }
}
```

### 3.3 Cleanup on Session Disconnect (Optional)

If both presenter and all controllers disconnect, consider starting a **grace period timer** (e.g., 5 minutes). If nobody reconnects, clean up early:

```
On all clients disconnected for a session:
  → Start 5-minute grace timer
  → If any client reconnects → cancel timer
  → If timer expires → treat as early cleanup (same as TTL cleanup)
```

This is optional but prevents abandoned sessions from lingering for 24 hours.

---

## 4. Deployment Considerations

### 4.1 Local Network (Primary Use Case)

The PPT Viewer is primarily designed for **local network use** — presenting in a room where the phone and laptop are on the same WiFi network.

```
Setup:
1. Start server on laptop: npm start
2. Server outputs: "Listening on http://192.168.1.100:3000"
3. Open browser on same laptop: http://localhost:3000
4. On mobile app: enter http://192.168.1.100:3000 as server URL
5. Both devices communicate over LAN
```

**Network Requirements:**
- Laptop and phone on the same WiFi network
- No firewall blocking port 3000
- No client isolation (AP isolation) on the WiFi router

### 4.2 Production Deployment (Optional)

For internet-accessible deployment:

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  Client  │─────▶│  Nginx       │─────▶│  Node.js     │
│  (HTTPS) │      │  (Reverse    │      │  (port 3000) │
│          │◀─────│   Proxy +    │◀─────│              │
│          │      │   TLS)       │      │              │
└──────────┘      └──────────────┘      └──────────────┘
```

**Nginx Configuration (production):**

```nginx
server {
    listen 443 ssl;
    server_name pptviewer.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    client_max_body_size 50M;

    # Static files and API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;  # 24 hours for long-lived WS
    }
}
```

### 4.3 System Dependencies

| Dependency | Required | Installation |
|------------|----------|-------------|
| Node.js 18+ | Yes | `nvm install 18` or system package |
| LibreOffice | Yes | `sudo apt install libreoffice-core` (Ubuntu/Debian) |
| | | `brew install --cask libreoffice` (macOS) |

**Verify LibreOffice:**
```bash
libreoffice --headless --version
# Should output: LibreOffice 7.x.x.x ...
```

---

## 5. Privacy & Data Handling

| Concern | Policy |
|---------|--------|
| **File retention** | All uploaded files are automatically deleted after 24 hours |
| **No user accounts** | No registration, no login, no personal data collected |
| **No analytics** | No tracking, no cookies (beyond session code in URL) |
| **File access** | Only accessible via unique 6-character code (acts as bearer token) |
| **No persistence** | Sessions stored in-memory only — server restart clears all sessions |
| **No logging of content** | Server logs metadata only (filename, size, code) — never file contents |

---

## 6. Checklist for Implementation

### Server Security Checklist

- [ ] `helmet()` middleware applied
- [ ] CORS configured with explicit origins
- [ ] File upload size limited to 50 MB via Multer
- [ ] File type validated: extension + MIME + magic bytes
- [ ] Filenames replaced with UUID (no user-controlled paths)
- [ ] Rate limiting on upload endpoint (10/15min)
- [ ] Rate limiting on API endpoints (60/min)
- [ ] WebSocket connections validated (code + role)
- [ ] WebSocket message types whitelisted
- [ ] WebSocket message size limited to 1 KB
- [ ] Max controllers per session enforced (5)
- [ ] Session code uses cryptographically random generation
- [ ] Cleanup cron runs every 30 minutes
- [ ] Orphaned files cleaned on server start
- [ ] LibreOffice process killed after 60s timeout
- [ ] Error responses don't leak internal paths or stack traces
- [ ] `X-Powered-By` header removed (helmet does this)

### Frontend Security Checklist

- [ ] No `innerHTML` with user data — use `textContent`
- [ ] File type checked client-side before upload (UX, not security)
- [ ] Session code displayed via `textContent`, not `innerHTML`
- [ ] WebSocket URL constructed from `location.host` (no hardcoded URLs)
- [ ] PDF.js loaded from versioned CDN with integrity hash (optional)

### Mobile App Security Checklist

- [ ] Server URL input validated as valid URI
- [ ] Session code input restricted to allowed charset
- [ ] No sensitive data stored (only server URL in secure storage)
- [ ] INTERNET permission only — no unnecessary permissions
- [ ] WebSocket connection uses WSS in production
- [ ] Auto-reconnect has maximum attempt limit (prevents infinite loop)

# PPT Viewer — Backend Design

## 1. Server Bootstrap (`server.js`)

### Responsibilities
- Load environment variables via `dotenv`
- Create Express app with middleware stack
- Serve `frontend/` as static files
- Create HTTP server from Express app
- Attach WebSocket server to HTTP server (path: `/ws`)
- Start cleanup scheduler
- Listen on `PORT` (default: 3000)

### Initialization Order

```
1.  dotenv.config()
2.  const app = express()
3.  app.use(helmet())                     // Security headers
4.  app.use(cors(corsOptions))            // CORS whitelist
5.  app.use(express.json())               // JSON body parser
6.  app.use('/api', apiLimiter)           // Global API rate limit
7.  app.use('/api', uploadRoutes)         // Mount API routes
8.  app.use(express.static('frontend'))   // Serve frontend
9.  const server = http.createServer(app)
10. initWebSocket(server, sessionManager) // Attach WS
11. startCleanupScheduler(sessionManager) // Start cron
12. server.listen(config.port)
```

### Express Static Serving

The Express server serves the `frontend/` directory as static files. This means:
- `GET /` → `frontend/index.html` (upload page)
- `GET /viewer.html` → `frontend/viewer.html` (slide viewer)
- All CSS/JS/assets served directly

---

## 2. Configuration (`config/index.js`)

```javascript
// Exported config object shape:
module.exports = {
  port: process.env.PORT || 3000,
  uploadDir: path.resolve(__dirname, '../uploads'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,  // 50 MB
  sessionTTL: parseInt(process.env.SESSION_TTL) || 24 * 60 * 60 * 1000,  // 24 hours in ms
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  libreOfficePath: process.env.LIBREOFFICE_PATH || 'libreoffice',  // System PATH
  cleanupInterval: '*/30 * * * *',  // Every 30 minutes (cron expression)
  codeLength: 6,
  codeCharset: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',  // Exclude ambiguous: 0/O, 1/I/L
  wsHeartbeatInterval: 30000,  // 30 seconds
  maxControllersPerSession: 5,
};
```

### `.env.example`

```env
PORT=3000
MAX_FILE_SIZE=52428800
SESSION_TTL=86400000
ALLOWED_ORIGINS=http://localhost:3000
LIBREOFFICE_PATH=libreoffice
```

---

## 3. Routes (`routes/upload.js`)

### Route: `POST /api/upload`

**Purpose:** Accept a `.ppt`/`.pptx`/`.pdf` file, convert to PDF if needed, create session, return code.

**Middleware Chain:**
```
uploadLimiter → multerUpload.single('file') → validateFile → handler
```

**Handler Logic:**
```
1.  Receive uploaded file from multer (saved to /uploads/ with UUID filename)
2.  If file is already a PDF:
    a. Skip conversion, use uploaded file as pdfPath
    b. Extract page count directly from PDF
3.  Else (PPT/PPTX):
    a. Call converter.convertToPDF(file.path)
    b. Get { pdfPath, pageCount } from converter
4.  Call sessionManager.createSession({ 
       originalName: file.originalname,
       pptxPath: file.path,
       pdfPath,
       pageCount,
     })
    c. Return 201: { code, slideCount: pageCount }
4.  On failure:
    a. Delete the uploaded file
    b. Return 500: { error: "Conversion failed" }
```

**Response (201):**
```json
{
  "code": "A3F9K2",
  "slideCount": 15
}
```

**Error Responses:**
| Status | Condition |
|--------|-----------|
| 400 | No file provided |
| 400 | Invalid file type (not .ppt/.pptx/.pdf) |
| 413 | File exceeds 50 MB |
| 429 | Rate limit exceeded |
| 500 | LibreOffice conversion failed |

---

### Route: `GET /api/slides/:code`

**Purpose:** Serve the converted PDF file for PDF.js rendering.

**Handler Logic:**
```
1.  Validate :code format (6 alphanumeric chars)
2.  Call sessionManager.getSession(code)
3.  If no session → 404: { error: "Session not found" }
4.  If session found:
    a. Set Content-Type: application/pdf
    b. Set Content-Disposition: inline
    c. Stream the PDF file using res.sendFile(session.pdfPath)
```

**Security:**
- The code acts as an access token — no additional auth needed
- Path traversal impossible: code maps to an absolute path in session store
- PDF served inline (not as download)

---

### Route: `GET /api/session/:code`

**Purpose:** Validate whether a session exists and return metadata (used by mobile app before WS connect).

**Handler Logic:**
```
1.  Validate :code format
2.  Call sessionManager.getSession(code)
3.  If no session → 404: { error: "Session not found" }
4.  If found → 200: { code, slideCount, createdAt, expiresAt, isPresenterConnected }
```

**Response (200):**
```json
{
  "code": "A3F9K2",
  "slideCount": 15,
  "createdAt": "2026-08-12T15:00:00.000Z",
  "expiresAt": "2026-08-13T15:00:00.000Z",
  "isPresenterConnected": true
}
```

---

## 4. Services

### 4.1 Converter Service (`services/converter.js`)

**Purpose:** Convert PPTX files to PDF using LibreOffice in headless mode.

**Function: `convertToPDF(inputPath)`**

```
1.  Determine output directory = path.dirname(inputPath)
2.  Spawn child process:
    Command: libreoffice --headless --convert-to pdf --outdir <outputDir> <inputPath>
3.  Wait for process to exit
4.  If exit code !== 0 → throw ConversionError with stderr
5.  Derive pdfPath by replacing .pptx extension with .pdf
6.  Verify PDF file exists (fs.access)
7.  Extract page count:
    - Read first 1024 bytes of PDF
    - Count occurrences of "/Type /Page" (excluding "/Type /Pages")
    - OR: Use a simple PDF parser to read page count from trailer
8.  Return { pdfPath, pageCount }
```

**Error Handling:**
- Timeout: Kill process after 60 seconds
- Missing LibreOffice: Throw descriptive error with install instructions
- Corrupted file: Catch conversion error, clean up partial output

**Page Count Extraction (Reliable Method):**
```javascript
// Read PDF and count page objects
const pdfBuffer = fs.readFileSync(pdfPath);
const pdfString = pdfBuffer.toString('latin1');
const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;
```

---

### 4.2 Session Manager (`services/sessionManager.js`)

**Purpose:** Manage in-memory session store with CRUD operations.

**Data Structure:**
```javascript
// Internal store
const sessions = new Map();

// Session object shape:
{
  code: "A3F9K2",               // Unique 6-char code
  originalName: "talk.pptx",    // Original filename (for display)
  pptxPath: "/abs/path/to/uuid.pptx",
  pdfPath: "/abs/path/to/uuid.pdf",
  pageCount: 15,
  createdAt: Date,              // Upload timestamp
  expiresAt: Date,              // createdAt + SESSION_TTL
  presenterWs: null,            // WebSocket reference (or null)
  controllerWs: [],             // Array of controller WebSocket refs
}
```

**Functions:**

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `createSession(fileData)` | `{ originalName, pptxPath, pdfPath, pageCount }` | `session` | Generate unique code, create session, add to Map |
| `getSession(code)` | `string` | `session \| null` | Lookup by code |
| `deleteSession(code)` | `string` | `boolean` | Remove from Map (does NOT delete files — cleanup service does that) |
| `getExpiredSessions()` | — | `session[]` | Filter sessions where `Date.now() > expiresAt` |
| `getAllSessions()` | — | `session[]` | Return all sessions (for admin/debug) |
| `generateCode()` | — | `string` | Generate unique 6-char code from charset, retry if collision |

**Code Generation Algorithm:**
```
1.  Build code from config.codeCharset (ABCDEFGHJKMNPQRSTUVWXYZ23456789)
2.  Use crypto.randomBytes(6) for randomness
3.  Map each byte to charset: charset[byte % charset.length]
4.  Check sessions.has(code) — if collision, regenerate (max 10 retries)
5.  Return code
```

---

### 4.3 Cleanup Service (`services/cleanup.js`)

**Purpose:** Periodically delete expired sessions and their files.

**Function: `startCleanupScheduler(sessionManager)`**

```
1.  Schedule cron job with config.cleanupInterval ('*/30 * * * *')
2.  On each tick:
    a. Get expired sessions from sessionManager.getExpiredSessions()
    b. For each expired session:
       i.   Close presenter WebSocket (if connected) with code 1000 + message "Session expired"
       ii.  Close all controller WebSockets
       iii. Delete pptxPath file (fs.unlink, catch ENOENT)
       iv.  Delete pdfPath file (fs.unlink, catch ENOENT)
       v.   Call sessionManager.deleteSession(code)
       vi.  Log: "Cleaned up session {code}, age: {age}h"
    c. Log summary: "Cleanup complete: {n} sessions removed"
```

**Robustness:**
- Wrap each session cleanup in try/catch so one failure doesn't block others
- Log errors but continue processing
- Handle case where files were already manually deleted

---

## 5. WebSocket Handler (`websocket/handler.js`)

### Connection Lifecycle

```
1.  Client sends WS upgrade request to: /ws?code=A3F9K2&role=presenter
2.  Server validates:
    a. code exists in session store → if not, close with 4001 "Invalid code"
    b. role is "presenter" or "controller" → if not, close with 4002 "Invalid role"
    c. If role=presenter and session already has a presenter → close with 4003 "Presenter already connected"
    d. If role=controller and controllers.length >= maxControllersPerSession → close with 4004 "Too many controllers"
3.  Register connection:
    a. If presenter: session.presenterWs = ws
    b. If controller: session.controllerWs.push(ws)
4.  Send JOINED message to the newly connected client
5.  Notify peers:
    a. If presenter joined → notify all controllers: PEER_CONNECTED { role: "presenter" }
    b. If controller joined → notify presenter: PEER_CONNECTED { role: "controller" }
6.  Set up heartbeat: ping every 30s, close if no pong within 10s
```

### Message Handling

**From Controller → relayed to Presenter:**
```javascript
// Controller sends:
{ "type": "COMMAND", "action": "NEXT_SLIDE" }
{ "type": "COMMAND", "action": "PREV_SLIDE" }
{ "type": "COMMAND", "action": "PLAY_VIDEO" }

// Server validates action is in allowed list, then forwards to presenter as-is
```

**From Presenter → relayed to all Controllers:**
```javascript
// Presenter sends:
{ "type": "SLIDE_UPDATE", "currentSlide": 4, "totalSlides": 15 }

// Server forwards to all connected controllers as:
{ "type": "SLIDE_SYNC", "currentSlide": 4, "totalSlides": 15 }
```

### Disconnection Handling

```
On WS close:
1.  If role was presenter:
    a. Set session.presenterWs = null
    b. Notify all controllers: PEER_DISCONNECTED { role: "presenter" }
2.  If role was controller:
    a. Remove from session.controllerWs array
    b. Notify presenter: PEER_DISCONNECTED { role: "controller" }
3.  Log: "Disconnected {role} from session {code}"
```

### Heartbeat (Keep-Alive)

```
Every 30 seconds:
1.  For each connected WS in all sessions:
    a. If ws.isAlive === false → terminate connection
    b. Set ws.isAlive = false
    c. Send ping frame
On pong received:
    → Set ws.isAlive = true
```

### Error Message Codes

| WS Close Code | Meaning |
|---------------|---------|
| 4001 | Invalid or expired session code |
| 4002 | Invalid role (must be "presenter" or "controller") |
| 4003 | Presenter slot already occupied |
| 4004 | Maximum controllers reached |
| 4005 | Session expired while connected |
| 1000 | Normal closure |

---

## 6. Middleware

### 6.1 Rate Limiter (`middleware/rateLimiter.js`)

```javascript
// Upload endpoint: strict
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 uploads per window per IP
  message: { error: 'Too many uploads. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API read endpoints: moderate
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max: 60,                    // 60 requests per minute per IP
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

### 6.2 File Validation (`middleware/validation.js`)

**Multer Configuration:**
```javascript
const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, cb) => {
    // UUID-based filename to prevent collisions and path traversal
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.ms-powerpoint',                                          // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  ];
  const allowedExts = ['.ppt', '.pptx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .ppt and .pptx files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxFileSize },
});
```

**Additional Validation (post-upload):**
```
1.  Read first 4 bytes of uploaded file (magic number check)
2.  .pptx files are ZIP archives: first 2 bytes = 0x50 0x4B ("PK")
3.  .ppt files (legacy): first 8 bytes = D0 CF 11 E0 A1 B1 1A E1 (OLE2)
4.  If magic number doesn't match → delete file, return 400
```

---

## 7. Error Handling Strategy

### Global Error Handler (Express)

```javascript
app.use((err, req, res, next) => {
  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum 50 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }

  // File validation errors
  if (err.message.includes('Only .ppt and .pptx')) {
    return res.status(400).json({ error: err.message });
  }

  // Generic server error
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

### WebSocket Error Handling

- All incoming WS messages wrapped in try/catch
- Malformed JSON → send error message, don't close connection
- Unknown message type → ignore with warning log
- Unexpected disconnection → clean up session references

---

## 8. Logging

Use `console.log` / `console.error` with structured prefixes:

```
[SERVER]  Server listening on port 3000
[UPLOAD]  File received: presentation.pptx (2.4 MB)
[CONVERT] Converting: uploads/abc-123.pptx → PDF
[CONVERT] Success: 15 pages extracted
[SESSION] Created session A3F9K2 (expires: 2026-08-13T15:00:00Z)
[WS]      Presenter connected to A3F9K2
[WS]      Controller connected to A3F9K2
[WS]      Command relayed: NEXT_SLIDE (A3F9K2)
[CLEANUP] Removed 3 expired sessions
[ERROR]   Conversion failed for abc-123.pptx: LibreOffice timeout
```

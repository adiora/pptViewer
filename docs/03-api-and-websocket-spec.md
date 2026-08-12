# PPT Viewer — API & WebSocket Protocol Specification

## 1. REST API

### Base URL

```
http://<host>:3000/api
```

All responses are JSON unless otherwise noted. All error responses follow the shape:
```json
{ "error": "Human-readable error message" }
```

---

### `POST /api/upload`

Upload a PowerPoint file and create a viewing session.

**Request:**
```
Content-Type: multipart/form-data

Form Fields:
  file: <binary .ppt, .pptx, or .pdf file>  (required, max 50 MB)
```

**Success Response (201 Created):**
```json
{
  "code": "A3F9K2",
  "slideCount": 15,
  "expiresAt": "2026-08-13T15:49:00.000Z"
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "No file provided" }` | Missing `file` field |
| 400 | `{ "error": "Only .ppt, .pptx, and .pdf files are allowed" }` | Wrong MIME or extension |
| 413 | `{ "error": "File too large. Maximum 50 MB." }` | Exceeds size limit |
| 429 | `{ "error": "Too many uploads. Try again later." }` | Rate limit (10/15min) |
| 500 | `{ "error": "File conversion failed. Please try again." }` | LibreOffice error |

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@presentation.pptx"
```

---

### `GET /api/slides/:code`

Retrieve the converted PDF file for client-side rendering via PDF.js.

**Parameters:**
| Param | Type | Validation |
|-------|------|-----------|
| `code` | URL param (string) | Must be exactly 6 chars, alphanumeric from allowed charset |

**Success Response (200 OK):**
```
Content-Type: application/pdf
Content-Disposition: inline
Body: <PDF binary stream>
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Invalid code format" }` | Code doesn't match `^[A-Z2-9]{6}$` |
| 404 | `{ "error": "Session not found or expired" }` | No session for code |

---

### `GET /api/session/:code`

Validate a session and retrieve its metadata. Used by the mobile app before establishing a WebSocket connection.

**Parameters:**
| Param | Type | Validation |
|-------|------|-----------|
| `code` | URL param (string) | Must be exactly 6 chars, alphanumeric from allowed charset |

**Success Response (200 OK):**
```json
{
  "code": "A3F9K2",
  "slideCount": 15,
  "createdAt": "2026-08-12T15:49:00.000Z",
  "expiresAt": "2026-08-13T15:49:00.000Z",
  "isPresenterConnected": true
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Invalid code format" }` | Code doesn't match pattern |
| 404 | `{ "error": "Session not found or expired" }` | No session for code |

---

## 2. WebSocket Protocol

### Connection Endpoint

```
ws://<host>:3000/ws?code=<SESSION_CODE>&role=<ROLE>
```

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| `code` | Yes | 6-char string | Session code from upload |
| `role` | Yes | `presenter` or `controller` | Client role |

### Connection Handshake Sequence

```
Client                              Server
  │                                    │
  │  1. GET /ws?code=A3F9K2&           │
  │     role=presenter                 │
  │  ─────────────────────────────▶    │
  │                                    │  2. Validate code exists
  │                                    │  3. Validate role
  │                                    │  4. Check slot availability
  │  5. 101 Switching Protocols        │
  │  ◀─────────────────────────────    │
  │                                    │
  │  6. { type: "JOINED", ... }        │
  │  ◀═════════════════════════════    │
  │                                    │
```

**Connection Rejection (WS close immediately after upgrade):**

| Close Code | Reason | Condition |
|------------|--------|-----------|
| 4001 | `Invalid or expired session code` | Code not found in store |
| 4002 | `Invalid role` | Role is not "presenter" or "controller" |
| 4003 | `Presenter already connected` | Another presenter is active |
| 4004 | `Maximum controllers reached` | ≥ 5 controllers connected |

---

### Message Types — Complete Reference

All messages are JSON strings. Every message has a `type` field.

---

#### Server → Client Messages

##### `JOINED`
Sent to a client immediately after successful connection.

```json
{
  "type": "JOINED",
  "role": "presenter",
  "slideCount": 15,
  "currentSlide": 1,
  "peers": {
    "presenter": true,
    "controllerCount": 2
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | The role assigned to this client |
| `slideCount` | number | Total slides in the presentation |
| `currentSlide` | number | Current slide number (1-indexed) |
| `peers` | object | Current connection state of other participants |

---

##### `COMMAND`
Relayed from controller to presenter. Server forwards the command without modification.

```json
{
  "type": "COMMAND",
  "action": "NEXT_SLIDE"
}
```

| `action` Value | Source | Description |
|---------------|--------|-------------|
| `NEXT_SLIDE` | Controller | Advance to next slide |
| `PREV_SLIDE` | Controller | Go to previous slide |
| `PLAY_VIDEO` | Controller | Toggle video play/pause on current slide |

---

##### `SLIDE_SYNC`
Sent to all controllers when the presenter navigates to a different slide.

```json
{
  "type": "SLIDE_SYNC",
  "currentSlide": 4,
  "totalSlides": 15
}
```

---

##### `PEER_CONNECTED`
Notification when a peer joins the session.

```json
{
  "type": "PEER_CONNECTED",
  "role": "controller",
  "controllerCount": 2
}
```

---

##### `PEER_DISCONNECTED`
Notification when a peer leaves the session.

```json
{
  "type": "PEER_DISCONNECTED",
  "role": "controller",
  "controllerCount": 1
}
```

---

##### `ERROR`
Sent when the server detects an issue with a client message.

```json
{
  "type": "ERROR",
  "message": "Unknown action: FAST_FORWARD"
}
```

---

##### `SESSION_EXPIRED`
Sent to all connected clients before the server closes their connections due to TTL expiry.

```json
{
  "type": "SESSION_EXPIRED",
  "message": "Session has expired after 24 hours"
}
```

---

#### Client → Server Messages

##### `COMMAND` (Controller only)
Send a navigation or playback command to the presenter.

```json
{
  "type": "COMMAND",
  "action": "NEXT_SLIDE"
}
```

**Allowed actions:** `NEXT_SLIDE`, `PREV_SLIDE`, `PLAY_VIDEO`

**Server behavior:**
1. Validate `action` is in the allowed list
2. If sender is not a controller → send ERROR, ignore
3. If no presenter connected → send ERROR: "No presenter connected"
4. Otherwise → forward to presenter's WebSocket

---

##### `SLIDE_UPDATE` (Presenter only)
Sent by the presenter whenever the current slide changes (via local navigation or remote command).

```json
{
  "type": "SLIDE_UPDATE",
  "currentSlide": 4,
  "totalSlides": 15
}
```

**Server behavior:**
1. Validate `currentSlide` and `totalSlides` are positive integers
2. If sender is not a presenter → send ERROR, ignore
3. Store `currentSlide` in session object (for new controller sync)
4. Forward to all controllers as `SLIDE_SYNC` message

---

### Complete Interaction Sequence

```
Presenter (Browser)            Server                    Controller (Mobile)
     │                            │                            │
     │  ── WS Connect ──▶         │                            │
     │  code=A3F9K2               │                            │
     │  role=presenter            │                            │
     │                            │                            │
     │  ◀── JOINED ──             │                            │
     │  { role: "presenter",      │                            │
     │    slideCount: 15,         │                            │
     │    currentSlide: 1 }       │                            │
     │                            │                            │
     │                            │     ◀── WS Connect ──      │
     │                            │     code=A3F9K2             │
     │                            │     role=controller         │
     │                            │                            │
     │                            │     ── JOINED ──▶           │
     │                            │     { role: "controller",   │
     │                            │       slideCount: 15,       │
     │                            │       currentSlide: 1 }     │
     │                            │                            │
     │  ◀── PEER_CONNECTED ──     │                            │
     │  { role: "controller" }    │                            │
     │                            │                            │
     │  ╔═══════════════════════════════════════════════════╗  │
     │  ║           PRESENTATION IN PROGRESS                ║  │
     │  ╚═══════════════════════════════════════════════════╝  │
     │                            │                            │
     │                            │  ◀── COMMAND ──            │
     │                            │  { action: "NEXT_SLIDE" }  │
     │  ◀── COMMAND ──            │                            │
     │  { action: "NEXT_SLIDE" }  │                            │
     │                            │                            │
     │  [Renders slide 2]         │                            │
     │                            │                            │
     │  ── SLIDE_UPDATE ──▶       │                            │
     │  { currentSlide: 2,        │                            │
     │    totalSlides: 15 }       │  ── SLIDE_SYNC ──▶         │
     │                            │  { currentSlide: 2,        │
     │                            │    totalSlides: 15 }       │
     │                            │                            │
     │                            │  ◀── COMMAND ──            │
     │                            │  { action: "PLAY_VIDEO" }  │
     │  ◀── COMMAND ──            │                            │
     │  { action: "PLAY_VIDEO" }  │                            │
     │                            │                            │
     │  [Toggles video playback]  │                            │
     │                            │                            │
     │                            │  ◀── COMMAND ──            │
     │                            │  { action: "PREV_SLIDE" }  │
     │  ◀── COMMAND ──            │                            │
     │  { action: "PREV_SLIDE" }  │                            │
     │                            │                            │
     │  [Renders slide 1]         │                            │
     │                            │                            │
     │  ── SLIDE_UPDATE ──▶       │                            │
     │  { currentSlide: 1,        │                            │
     │    totalSlides: 15 }       │  ── SLIDE_SYNC ──▶         │
     │                            │  { currentSlide: 1,        │
     │                            │    totalSlides: 15 }       │
     │                            │                            │
     │  ╔═══════════════════════════════════════════════════╗  │
     │  ║              CONTROLLER DISCONNECTS               ║  │
     │  ╚═══════════════════════════════════════════════════╝  │
     │                            │                            │
     │                            │       ◀── WS Close ──     │
     │  ◀── PEER_DISCONNECTED ──  │                            │
     │  { role: "controller" }    │                            │
```

---

### Heartbeat Protocol

```
Server                          Client
  │                                │
  │  ── ping frame ──▶             │  (every 30 seconds)
  │                                │
  │  ◀── pong frame ──             │  (automatic in browsers & Flutter)
  │                                │
  │  ... 30 seconds ...            │
  │                                │
  │  ── ping frame ──▶             │
  │                                │
  │  [no pong within 10s]          │
  │                                │
  │  ── terminate connection ──    │
```

**Implementation Notes:**
- Server sends WebSocket ping frames (not application-level messages)
- Browser WebSocket clients automatically respond to ping frames with pong
- Flutter `web_socket_channel` also handles ping/pong automatically
- Server tracks `isAlive` flag per connection, reset on pong receipt

---

## 3. Input Validation Summary

| Endpoint / Context | Field | Validation Rule |
|-------------------|-------|----------------|
| `POST /api/upload` | `file` | Required; `.ppt`/`.pptx` only; max 50 MB; magic byte check |
| `GET /api/slides/:code` | `code` | Regex: `^[A-HJ-NP-Z2-9]{6}$` (excludes 0,1,I,L,O) |
| `GET /api/session/:code` | `code` | Same regex as above |
| WS connect | `code` | Same regex; must exist in session store |
| WS connect | `role` | Must be `"presenter"` or `"controller"` |
| WS message | `type` | Must be `"COMMAND"` or `"SLIDE_UPDATE"` |
| WS COMMAND | `action` | Must be `"NEXT_SLIDE"`, `"PREV_SLIDE"`, or `"PLAY_VIDEO"` |
| WS SLIDE_UPDATE | `currentSlide` | Positive integer, `1 ≤ n ≤ totalSlides` |
| WS SLIDE_UPDATE | `totalSlides` | Positive integer, matches session's `pageCount` |

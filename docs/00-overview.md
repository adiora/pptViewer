# PPT Viewer — Project Overview & Architecture

## 1. Project Summary

A browser-based PowerPoint presentation viewer that can be **remotely controlled from a mobile phone** using hardware volume buttons. Users upload `.ppt`/`.pptx` files through a web frontend, receive a **6-character session code**, and begin viewing slides full-screen. A companion Flutter mobile app connects to the same session via the code and uses volume buttons to navigate slides and control video playback — no touch interaction needed during a live presentation.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JS | Upload UI, slide viewer, fullscreen |
| **Backend** | Node.js 18+, Express 4 | REST API, static serving, orchestration |
| **WebSocket** | `ws` (npm) | Real-time bidirectional commands |
| **PPT → PDF** | LibreOffice Headless | Server-side PPTX to PDF conversion |
| **PDF Rendering** | PDF.js (Mozilla) | Client-side PDF → canvas slide rendering |
| **Mobile App** | Flutter 3+ (Dart) | Remote control via volume buttons |
| **Scheduler** | `node-cron` (npm) | Periodic file cleanup (24-hour expiry) |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐        HTTPS / REST        ┌──────────────────┐  │
│  │              │  ──────────────────────────▶│                  │  │
│  │   Frontend   │  POST /api/upload           │                  │  │
│  │  (Browser)   │  GET  /api/slides/:code     │   Node.js /      │  │
│  │              │◀──────────────────────────  │   Express        │  │
│  │  ┌────────┐  │                             │   Server         │  │
│  │  │ PDF.js │  │        WebSocket            │                  │  │
│  │  └────────┘  │  ◀═══════════════════════▶  │  ┌────────────┐  │  │
│  └──────────────┘   ws://host/ws?code=X&      │  │  Session    │  │  │
│                      role=presenter           │  │  Manager    │  │  │
│                                               │  └────────────┘  │  │
│                                               │  ┌────────────┐  │  │
│  ┌──────────────┐        WebSocket            │  │  File       │  │  │
│  │   Flutter    │  ◀═══════════════════════▶  │  │  Converter  │  │  │
│  │  Mobile App  │   ws://host/ws?code=X&      │  │ (LibreOffice│  │  │
│  │              │    role=controller           │  │  Headless)  │  │  │
│  │  ┌────────┐  │                             │  └────────────┘  │  │
│  │  │ Volume │  │                             │  ┌────────────┐  │  │
│  │  │ Button │  │                             │  │  Cleanup    │  │  │
│  │  │ Capture│  │                             │  │  Scheduler  │  │  │
│  │  └────────┘  │                             │  │  (24h TTL)  │  │  │
│  └──────────────┘                             │  └────────────┘  │  │
│                                               └──────────────────┘  │
│                                                        │            │
│                                               ┌────────▼─────────┐  │
│                                               │   /uploads/      │  │
│                                               │   (File System)  │  │
│                                               │   .pptx + .pdf   │  │
│                                               └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Core Data Flow

### 4.1 Upload & Session Creation

```
User (Browser)                     Server                        File System
     │                               │                               │
     │  1. POST /api/upload          │                               │
     │     (multipart: .pptx file)   │                               │
     │  ─────────────────────────▶   │                               │
     │                               │  2. Validate file type/size   │
     │                               │  3. Save .pptx to /uploads/   │
     │                               │  ─────────────────────────▶   │
     │                               │                               │
     │                               │  4. Convert PPTX → PDF        │
     │                               │     (LibreOffice headless)    │
     │                               │  ─────────────────────────▶   │
     │                               │                               │
     │                               │  5. Generate 6-char code      │
     │                               │  6. Create session object     │
     │                               │     { code, pdfPath,          │
     │                               │       uploadedAt,             │
     │                               │       slideCount }            │
     │                               │                               │
     │  7. Response:                 │                               │
     │     { code: "A3F9K2",         │                               │
     │       slideCount: 15 }        │                               │
     │  ◀─────────────────────────   │                               │
```

### 4.2 Viewing & Remote Control

```
Browser (Presenter)              Server (WS Hub)           Mobile (Controller)
     │                               │                               │
     │  1. WS connect                │                               │
     │     ?code=A3F9K2              │                               │
     │     &role=presenter           │                               │
     │  ═══════════════════════════▶ │                               │
     │                               │  2. WS connect                │
     │                               │     ?code=A3F9K2              │
     │                               │     &role=controller          │
     │                               │ ◀═══════════════════════════  │
     │  3. PEER_CONNECTED            │                               │
     │  ◀═══════════════════════════ │                               │
     │                               │                               │
     │                               │  4. COMMAND: NEXT_SLIDE       │
     │                               │ ◀═══════════════════════════  │
     │  5. COMMAND: NEXT_SLIDE       │                               │
     │  ◀═══════════════════════════ │                               │
     │                               │                               │
     │  6. SLIDE_UPDATE              │                               │
     │     { current: 4, total: 15 } │                               │
     │  ═══════════════════════════▶ │                               │
     │                               │  7. SLIDE_SYNC                │
     │                               │     { current: 4, total: 15 } │
     │                               │ ═══════════════════════════▶  │
```

### 4.3 File Cleanup (24-Hour TTL)

```
Cron Scheduler (every 30 minutes)
     │
     ├──▶ Scan all sessions
     │      │
     │      ├── Session age > 24 hours?
     │      │       │
     │      │       YES ──▶ Close active WebSocket connections
     │      │              ──▶ Delete .pptx and .pdf from /uploads/
     │      │              ──▶ Remove session from in-memory store
     │      │
     │      │       NO  ──▶ Skip
     │      │
     │      └── Next session...
     │
     └── Schedule next run
```

---

## 5. Session Lifecycle

```
  CREATED ──────▶ ACTIVE ──────▶ EXPIRED ──────▶ DELETED
     │               │               │
  File uploaded   WS connected    24h elapsed
  Code generated  Slides viewed   Cron cleans up
                  Remote control
```

| State | Trigger | What Exists |
|-------|---------|-------------|
| `CREATED` | File uploaded, code generated | `.pptx`, `.pdf`, session in memory |
| `ACTIVE` | Presenter or controller connects via WS | Same + active WS connections |
| `EXPIRED` | 24 hours since upload | Session marked for deletion |
| `DELETED` | Cleanup cron runs | All files and session data removed |

---

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **PDF.js for rendering** | Client-side PDF rendering | Avoids generating 100s of images server-side; PDF preserves layout fidelity; reduces storage and bandwidth |
| **LibreOffice headless** | Server-side PPTX→PDF | Most reliable open-source conversion; handles complex slides, fonts, animations |
| **`ws` over Socket.IO** | Lightweight WebSocket | No need for Socket.IO's fallbacks; Flutter's `web_socket_channel` works natively with raw WS; smaller bundle |
| **6-char alphanumeric code** | `[A-Z0-9]` excluding ambiguous chars | ~1.5 billion combinations; human-readable; easy to type on mobile |
| **In-memory session store** | `Map<string, Session>` | Simple for single-server deployment; sessions are ephemeral (24h); no database needed |
| **Volume button control** | Intercept hardware events in Flutter | Hands-free presentation control; natural ergonomics; no screen interaction needed |

---

## 7. Document Index

| Document | Description |
|----------|-------------|
| [01-project-structure.md](./01-project-structure.md) | Complete file tree with per-file descriptions |
| [02-backend-design.md](./02-backend-design.md) | Express server, routes, services, middleware |
| [03-api-and-websocket-spec.md](./03-api-and-websocket-spec.md) | REST endpoints & WebSocket message protocol |
| [04-frontend-design.md](./04-frontend-design.md) | HTML pages, CSS design system, JS modules |
| [05-mobile-app-design.md](./05-mobile-app-design.md) | Flutter app, volume button capture, WS client |
| [06-security-and-cleanup.md](./06-security-and-cleanup.md) | Security hardening, rate limiting, file cleanup |

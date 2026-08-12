# ✦ PPT Viewer — Remote PowerPoint Presenter

A browser-based PowerPoint presentation viewer remotely controlled from a companion Flutter mobile phone app using **physical hardware volume buttons**.

Users upload `.ppt`/`.pptx` files through the web frontend, receive a **6-character session code**, and view full-screen slides on a computer or projector. The mobile app connects to the session using the code and captures physical volume key presses — allowing hands-free presentation navigation without touching the phone screen.

---

## 🌟 Key Features

- **Presentation Upload**: Upload `.pptx` or `.ppt` files up to 50 MB.
- **Server Conversion**: Automated server-side LibreOffice conversion to PDF.
- **Client Slide Renderer**: Crisp client-side PDF rendering powered by Mozilla PDF.js.
- **Hands-Free Mobile Control**:
  - **Volume Up (`Vol ▲`)**: Next Slide (`NEXT_SLIDE`)
  - **Volume Down (`Vol ▼`)**: Previous Slide (`PREV_SLIDE`)
  - **Both Volume Keys (`Vol ▲+▼`)**: Toggle Video Playback (`PLAY_VIDEO`)
- **Real-Time WebSocket Sync**: Low-latency bidirectional synchronization between presenter screen and mobile controllers.
- **24-Hour Expiration**: Automatic background cron cleanup of session storage and temporary files after 24 hours.

---

## 🏗️ Architecture

```
┌─────────────────┐       HTTPS / REST       ┌──────────────────┐
│   Web Frontend  │ ────────────────────────▶│                  │
│  (index & viewer│ GET /api/slides/:code    │   Node.js /      │
│     PDF.js)     │◀────────────────────────  │   Express        │
│                 │       WebSocket          │   Server         │
│                 │◀═══════════════════════▶ │                  │
└─────────────────┘   role=presenter         │  ┌────────────┐  │
                                             │  │  Session   │  │
┌─────────────────┐       WebSocket          │  │  Manager   │  │
│  Flutter Mobile │◀═══════════════════════▶ │  └────────────┘  │
│   Companion App │   role=controller        │  ┌────────────┐  │
│ (HW Volume Keys)│                          │  │ LibreOffice│  │
└─────────────────┘                          │  └────────────┘  │
                                             └──────────────────┘
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0+
- **LibreOffice**: Installed and accessible in system `PATH` (`libreoffice --version`)
- **Flutter**: v3.0+ (for mobile app build)

### 2. Start Backend Server & Web App
```bash
# Install server dependencies
cd server
npm install

# Start Express & WebSocket server
npm start
```
The web application will be live at `http://localhost:3000`.

### 3. Launch Mobile Companion App
```bash
# Navigate to mobile app directory
cd mobile/ppt_remote

# Fetch dependencies
flutter pub get

# Run on connected device or emulator
flutter run
```

---

## 📱 How to Use

1. **Upload Presentation**: Open `http://localhost:3000` on your computer or projector. Drop your `.pptx` file into the upload zone.
2. **Get Session Code**: A unique 6-character code (e.g., `A3F9K2`) will be generated. Click **Start Presenting** to launch full-screen slide viewer mode.
3. **Connect Companion App**: Open the Flutter app on your phone, enter your server IP (`http://<your-ip>:3000`), and enter the 6-character code.
4. **Present Hands-Free**:
   - Press **Volume Up** to advance to the next slide.
   - Press **Volume Down** to go back to the previous slide.
   - Press **Both Volume Keys** simultaneously (within 300ms) to play/pause embedded videos.

---

## 📂 Project Structure

```
pptViewer/
├── docs/                      # Complete architecture & design specifications
├── frontend/                  # Web Frontend (HTML5, Vanilla JS, CSS Glassmorphism)
│   ├── index.html             # Upload landing page & session code view
│   ├── viewer.html            # Fullscreen PDF.js slide presenter
│   ├── css/styles.css         # CSS design tokens & stylesheet
│   └── js/
│       ├── upload.js          # File upload & XHR progress logic
│       ├── viewer.js          # PDF.js viewport calculation & keyboard nav
│       └── websocket-client.js# Real-time WebSocket presenter client
├── server/                    # Node.js Express & WebSocket Backend
│   ├── server.js              # Express app & WS server bootstrap
│   ├── config/                # Environment variables & constants
│   ├── routes/upload.js       # REST upload & slide stream endpoints
│   ├── services/
│   │   ├── sessionManager.js  # In-memory session store & code generator
│   │   ├── converter.js       # LibreOffice PPTX to PDF converter
│   │   └── cleanup.js         # 24h cron cleanup scheduler
│   └── websocket/handler.js   # Room routing & command relay
└── mobile/ppt_remote/         # Flutter Mobile Companion App
    ├── lib/
    │   ├── main.dart          # App entrypoint & dark theme
    │   ├── screens/           # ConnectScreen & RemoteScreen UIs
    │   ├── services/          # WebSocket & Volume key intercept services
    │   ├── models/            # Command enum & JSON serialization
    │   └── utils/             # Application constants
    ├── android/               # Android Kotlin MainActivity volume key override
    └── ios/                   # iOS Swift AppDelegate AVAudioSession observer
```

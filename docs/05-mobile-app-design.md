# PPT Viewer — Mobile App Design (Flutter)

## 1. App Overview

The Flutter mobile app serves as a **hardware remote control** for the PPT Viewer. Users enter a 6-character session code, connect to the server via WebSocket, and then use the phone's **physical volume buttons** to control slide navigation — no need to look at or touch the screen during a presentation.

### Core User Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │              │     │              │
│  Connect     │────▶│   Remote     │────▶│  Disconnect  │
│  Screen      │     │   Screen     │     │  (back)      │
│              │     │              │     │              │
│  Enter code  │     │  Volume Up   │     │              │
│  Enter URL   │     │  = Next      │     │              │
│  [Connect]   │     │              │     │              │
│              │     │  Volume Down │     │              │
│              │     │  = Previous  │     │              │
│              │     │              │     │              │
│              │     │  Both Vols   │     │              │
│              │     │  = Play Video│     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 2. App Architecture

### 2.1 Routing

```dart
// main.dart
MaterialApp(
  title: 'PPT Remote',
  theme: darkTheme,           // Dark theme matching web frontend
  initialRoute: '/connect',
  routes: {
    '/connect': (ctx) => ConnectScreen(),
    '/remote': (ctx) => RemoteScreen(),
  },
);
```

### 2.2 State Management

Use `Provider` for dependency injection of services:

```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => WebSocketService()),
    Provider(create: (_) => VolumeButtonService()),
  ],
  child: MaterialApp(...),
)
```

### 2.3 Theme

```dart
final darkTheme = ThemeData(
  brightness: Brightness.dark,
  scaffoldBackgroundColor: Color(0xFF0A0A0F),
  colorScheme: ColorScheme.dark(
    primary: Color(0xFF6366F1),       // Indigo accent (match web)
    secondary: Color(0xFF8B5CF6),
    surface: Color(0xFF1A1A2E),
    error: Color(0xFFEF4444),
  ),
  fontFamily: 'Inter',
  cardTheme: CardTheme(
    color: Color(0xFF1A1A2E),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      padding: EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
);
```

---

## 3. Screens

### 3.1 Connect Screen (`screens/connect_screen.dart`)

#### UI Layout

```
┌──────────────────────────────┐
│                              │
│         ✦ PPT Remote         │
│                              │
│   ┌──────────────────────┐   │
│   │  Server URL           │   │
│   │  ┌──────────────────┐ │   │
│   │  │ http://192.168... │ │   │
│   │  └──────────────────┘ │   │
│   │                       │   │
│   │  Session Code         │   │
│   │  ┌──────────────────┐ │   │
│   │  │ A 3 F 9 K 2      │ │   │
│   │  └──────────────────┘ │   │
│   │                       │   │
│   │  [ 🔗 Connect ]      │   │
│   │                       │   │
│   │  ─────── or ───────   │   │
│   │                       │   │
│   │  [ 📷 Scan QR Code ] │   │  ← Future enhancement
│   └──────────────────────┘   │
│                              │
│   ┌──────────────────────┐   │
│   │  ℹ️ How to use:       │   │
│   │  1. Upload a .pptx    │   │
│   │     on your computer  │   │
│   │  2. Enter the code    │   │
│   │     shown on screen   │   │
│   │  3. Use volume keys   │   │
│   │     to control slides │   │
│   └──────────────────────┘   │
│                              │
└──────────────────────────────┘
```

#### Logic

```dart
class ConnectScreen extends StatefulWidget { ... }

class _ConnectScreenState extends State<ConnectScreen> {
  final _codeController = TextEditingController();
  final _urlController = TextEditingController(text: 'http://192.168.1.100:3000');
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _connect() async {
    // 1. Validate inputs
    final code = _codeController.text.trim().toUpperCase();
    final url = _urlController.text.trim();

    if (code.length != 6) {
      setState(() => _errorMessage = 'Code must be 6 characters');
      return;
    }

    if (!Uri.tryParse(url)?.hasAuthority ?? true) {
      setState(() => _errorMessage = 'Invalid server URL');
      return;
    }

    setState(() { _isLoading = true; _errorMessage = null; });

    // 2. Validate session exists via REST API
    try {
      final response = await http.get(Uri.parse('$url/api/session/$code'));
      if (response.statusCode == 404) {
        setState(() { _errorMessage = 'Session not found'; _isLoading = false; });
        return;
      }
      if (response.statusCode != 200) {
        setState(() { _errorMessage = 'Server error'; _isLoading = false; });
        return;
      }

      // 3. Parse session info
      final session = jsonDecode(response.body);

      // 4. Save URL for future use
      final storage = FlutterSecureStorage();
      await storage.write(key: 'server_url', value: url);

      // 5. Navigate to remote screen with session data
      Navigator.pushNamed(context, '/remote', arguments: {
        'code': code,
        'serverUrl': url,
        'slideCount': session['slideCount'],
      });
    } catch (e) {
      setState(() { _errorMessage = 'Cannot reach server'; _isLoading = false; });
    }
  }
}
```

#### Input Formatting

```dart
// Code input field: auto-uppercase, max 6 chars, only allowed charset
TextField(
  controller: _codeController,
  textCapitalization: TextCapitalization.characters,
  maxLength: 6,
  inputFormatters: [
    FilteringTextInputFormatter.allow(RegExp(r'[A-HJ-NP-Z2-9]')),
    UpperCaseTextFormatter(),  // Custom formatter
  ],
  style: TextStyle(
    fontFamily: 'monospace',
    fontSize: 28,
    letterSpacing: 12,
  ),
  textAlign: TextAlign.center,
  decoration: InputDecoration(
    hintText: '••••••',
    counterText: '',  // Hide character counter
  ),
)
```

---

### 3.2 Remote Screen (`screens/remote_screen.dart`)

#### UI Layout

```
┌──────────────────────────────┐
│                              │
│     🟢 Connected             │
│     Session: A3F9K2          │
│                              │
│   ┌──────────────────────┐   │
│   │                      │   │
│   │    Slide  4 / 15     │   │
│   │                      │   │
│   │    ████████████░░░░   │   │  ← Visual slide progress bar
│   │                      │   │
│   └──────────────────────┘   │
│                              │
│   ┌──────────────────────┐   │
│   │  USE VOLUME BUTTONS  │   │
│   │                      │   │
│   │  Vol ▲  Next Slide   │   │
│   │  Vol ▼  Prev Slide   │   │
│   │  Both   Play Video   │   │
│   └──────────────────────┘   │
│                              │
│   ┌──────────────────────┐   │
│   │  Manual Controls     │   │  ← Fallback if volume buttons
│   │                      │   │    don't work on some devices
│   │  [◀ Prev]  [Next ▶]  │   │
│   │       [▶ Play]        │   │
│   └──────────────────────┘   │
│                              │
│     [ Disconnect ]           │
│                              │
└──────────────────────────────┘
```

#### Logic

```dart
class RemoteScreen extends StatefulWidget { ... }

class _RemoteScreenState extends State<RemoteScreen> {
  late WebSocketService _wsService;
  late VolumeButtonService _volumeService;
  late StreamSubscription _commandSub;
  late StreamSubscription _wsSub;

  int _currentSlide = 1;
  int _totalSlides = 1;
  bool _isConnected = false;
  bool _presenterConnected = false;

  @override
  void initState() {
    super.initState();

    // Get args from route
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final args = ModalRoute.of(context)!.settings.arguments as Map;
      _totalSlides = args['slideCount'];

      // 1. Connect WebSocket
      _wsService = context.read<WebSocketService>();
      _wsService.connect(args['serverUrl'], args['code']);

      // 2. Listen for WS messages
      _wsSub = _wsService.messages.listen(_handleMessage);

      // 3. Start volume button capture
      _volumeService = context.read<VolumeButtonService>();
      _commandSub = _volumeService.commands.listen(_onCommand);
    });
  }

  void _handleMessage(Map<String, dynamic> message) {
    switch (message['type']) {
      case 'JOINED':
        setState(() {
          _isConnected = true;
          _currentSlide = message['currentSlide'] ?? 1;
          _totalSlides = message['slideCount'] ?? _totalSlides;
          _presenterConnected = message['peers']?['presenter'] ?? false;
        });
        break;
      case 'SLIDE_SYNC':
        setState(() {
          _currentSlide = message['currentSlide'];
          _totalSlides = message['totalSlides'];
        });
        // Optional: haptic feedback on slide change
        HapticFeedback.lightImpact();
        break;
      case 'PEER_CONNECTED':
        if (message['role'] == 'presenter') {
          setState(() => _presenterConnected = true);
        }
        break;
      case 'PEER_DISCONNECTED':
        if (message['role'] == 'presenter') {
          setState(() => _presenterConnected = false);
        }
        break;
      case 'SESSION_EXPIRED':
        _showExpiredDialog();
        break;
    }
  }

  void _onCommand(Command command) {
    // Send command via WebSocket
    _wsService.sendCommand(command);

    // Haptic feedback
    switch (command) {
      case Command.nextSlide:
      case Command.prevSlide:
        HapticFeedback.selectionClick();
        break;
      case Command.playVideo:
        HapticFeedback.heavyImpact();
        break;
    }
  }

  @override
  void dispose() {
    _commandSub.cancel();
    _wsSub.cancel();
    _volumeService.dispose();
    _wsService.disconnect();
    super.dispose();
  }
}
```

---

## 4. Services

### 4.1 WebSocket Service (`services/websocket_service.dart`)

```dart
class WebSocketService extends ChangeNotifier {
  WebSocketChannel? _channel;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  String? _serverUrl;
  String? _code;
  bool _isConnected = false;
  bool _intentionalClose = false;

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  bool get isConnected => _isConnected;

  /// Connect to the WebSocket server as a controller
  void connect(String serverUrl, String code) {
    _serverUrl = serverUrl;
    _code = code;
    _intentionalClose = false;
    _establishConnection();
  }

  void _establishConnection() {
    // Build WS URL from HTTP URL
    // http://host:port → ws://host:port/ws?code=X&role=controller
    // https://host:port → wss://host:port/ws?code=X&role=controller
    final httpUri = Uri.parse(_serverUrl!);
    final wsScheme = httpUri.scheme == 'https' ? 'wss' : 'ws';
    final wsUrl = '$wsScheme://${httpUri.host}:${httpUri.port}/ws?code=$_code&role=controller';

    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

      _channel!.stream.listen(
        (data) {
          _reconnectAttempts = 0;  // Reset on successful message
          final message = jsonDecode(data as String);
          _messageController.add(message);

          if (message['type'] == 'JOINED') {
            _isConnected = true;
            notifyListeners();
          }
        },
        onError: (error) {
          debugPrint('WS Error: $error');
          _handleDisconnect();
        },
        onDone: () {
          _isConnected = false;
          notifyListeners();
          if (!_intentionalClose) {
            _handleDisconnect();
          }
        },
      );
    } catch (e) {
      debugPrint('WS Connection failed: $e');
      _handleDisconnect();
    }
  }

  /// Send a command to the server
  void sendCommand(Command command) {
    if (_channel == null || !_isConnected) return;

    _channel!.sink.add(jsonEncode({
      'type': 'COMMAND',
      'action': command.toAction(),
    }));
  }

  /// Auto-reconnect with exponential backoff
  void _handleDisconnect() {
    _isConnected = false;
    notifyListeners();

    if (_intentionalClose || _reconnectAttempts >= Constants.maxReconnectAttempts) {
      return;
    }

    final delay = Duration(
      milliseconds: (Constants.baseReconnectDelay.inMilliseconds *
          (1 << _reconnectAttempts))
          .clamp(0, 30000),  // Cap at 30 seconds
    );

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      _reconnectAttempts++;
      _establishConnection();
    });
  }

  /// Intentional disconnect
  void disconnect() {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _isConnected = false;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    _messageController.close();
    super.dispose();
  }
}
```

---

### 4.2 Volume Button Service (`services/volume_button_service.dart`)

#### Simultaneous Press Detection Algorithm

```
PROBLEM:
  Detect three gestures from two buttons:
  - Volume Up only    → NEXT_SLIDE
  - Volume Down only  → PREV_SLIDE
  - Both simultaneously → PLAY_VIDEO

ALGORITHM:
  Use a 300ms debounce window to detect "simultaneous" presses.

  State variables:
    - pendingButton: 'up' | 'down' | null
    - pendingTimer: Timer | null

  On Volume Up pressed:
    if pendingButton == 'down':
      // Both pressed within 300ms → PLAY_VIDEO
      cancel pendingTimer
      pendingButton = null
      emit Command.playVideo
    else:
      // Start waiting for possible simultaneous press
      pendingButton = 'up'
      pendingTimer = Timer(300ms, () {
        pendingButton = null
        emit Command.nextSlide
      })

  On Volume Down pressed:
    if pendingButton == 'up':
      // Both pressed within 300ms → PLAY_VIDEO
      cancel pendingTimer
      pendingButton = null
      emit Command.playVideo
    else:
      pendingButton = 'down'
      pendingTimer = Timer(300ms, () {
        pendingButton = null
        emit Command.prevSlide
      })
```

#### Dart Implementation

```dart
class VolumeButtonService {
  static const _platform = MethodChannel('com.pptremote/volume');
  final _commandController = StreamController<Command>.broadcast();
  String? _pendingButton;
  Timer? _pendingTimer;

  Stream<Command> get commands => _commandController.stream;

  VolumeButtonService() {
    _platform.setMethodCallHandler(_handleMethodCall);
  }

  Future<dynamic> _handleMethodCall(MethodCall call) async {
    switch (call.method) {
      case 'volumeUp':
        _onVolumeUp();
        break;
      case 'volumeDown':
        _onVolumeDown();
        break;
    }
  }

  void _onVolumeUp() {
    if (_pendingButton == 'down') {
      // Simultaneous: both pressed within window
      _pendingTimer?.cancel();
      _pendingButton = null;
      _commandController.add(Command.playVideo);
    } else {
      _pendingButton = 'up';
      _pendingTimer?.cancel();
      _pendingTimer = Timer(Constants.simultaneousPressWindow, () {
        _pendingButton = null;
        _commandController.add(Command.nextSlide);
      });
    }
  }

  void _onVolumeDown() {
    if (_pendingButton == 'up') {
      // Simultaneous: both pressed within window
      _pendingTimer?.cancel();
      _pendingButton = null;
      _commandController.add(Command.playVideo);
    } else {
      _pendingButton = 'down';
      _pendingTimer?.cancel();
      _pendingTimer = Timer(Constants.simultaneousPressWindow, () {
        _pendingButton = null;
        _commandController.add(Command.prevSlide);
      });
    }
  }

  void dispose() {
    _pendingTimer?.cancel();
    _commandController.close();
  }
}
```

---

## 5. Platform Channels (Native Volume Button Capture)

### 5.1 Android — `MainActivity.kt`

The Android app must override `dispatchKeyEvent` to intercept volume button presses and prevent the system from changing the volume.

```kotlin
// android/app/src/main/kotlin/com/pptremote/app/MainActivity.kt

package com.pptremote.app

import android.view.KeyEvent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.pptremote/volume"

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_VOLUME_UP -> {
                    // Send to Flutter via MethodChannel
                    val channel = MethodChannel(flutterEngine!!.dartExecutor.binaryMessenger, CHANNEL)
                    channel.invokeMethod("volumeUp", null)
                    return true  // Consume event — don't change system volume
                }
                KeyEvent.KEYCODE_VOLUME_DOWN -> {
                    val channel = MethodChannel(flutterEngine!!.dartExecutor.binaryMessenger, CHANNEL)
                    channel.invokeMethod("volumeDown", null)
                    return true  // Consume event
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
```

**Key points:**
- `return true` prevents the system volume from changing
- Only intercept `ACTION_DOWN` to avoid duplicate events from `ACTION_UP`
- The MethodChannel name must match the Flutter side: `com.pptremote/volume`

### 5.2 iOS — `AppDelegate.swift`

iOS volume button interception requires using `AVAudioSession`:

```swift
// ios/Runner/AppDelegate.swift

import UIKit
import Flutter
import AVFoundation
import MediaPlayer

@main
@objc class AppDelegate: FlutterAppDelegate {
  private var volumeChannel: FlutterMethodChannel?
  private var audioSession: AVAudioSession?
  private var volumeObservation: NSKeyValueObservation?
  private var lastVolume: Float = 0.5

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let controller = window?.rootViewController as! FlutterViewController
    volumeChannel = FlutterMethodChannel(
      name: "com.pptremote/volume",
      binaryMessenger: controller.binaryMessenger
    )

    setupVolumeObserver()
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func setupVolumeObserver() {
    audioSession = AVAudioSession.sharedInstance()
    try? audioSession?.setActive(true)

    lastVolume = audioSession?.outputVolume ?? 0.5

    // Observe volume changes
    volumeObservation = audioSession?.observe(\.outputVolume, options: [.new]) {
      [weak self] _, change in
      guard let self = self, let newVolume = change.newValue else { return }

      if newVolume > self.lastVolume {
        self.volumeChannel?.invokeMethod("volumeUp", arguments: nil)
      } else if newVolume < self.lastVolume {
        self.volumeChannel?.invokeMethod("volumeDown", arguments: nil)
      }

      // Reset volume to middle to allow continuous presses
      // (prevents hitting 0 or max)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        // Use MPVolumeView to set volume silently
        let volumeView = MPVolumeView(frame: .zero)
        if let slider = volumeView.subviews.first(where: { $0 is UISlider }) as? UISlider {
          slider.value = 0.5
        }
        self.lastVolume = 0.5
      }
    }

    // Hide system volume HUD by adding an off-screen MPVolumeView
    let volumeView = MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 0, height: 0))
    window?.addSubview(volumeView)
  }
}
```

**Key points:**
- Uses KVO (Key-Value Observing) on `AVAudioSession.outputVolume`
- After each press, resets volume to 0.5 to prevent hitting 0 or max limits
- Hides system volume HUD by adding off-screen `MPVolumeView`
- The volume reset introduces a minor (~100ms) delay

---

## 6. Models

### 6.1 Command (`models/command.dart`)

```dart
enum Command {
  nextSlide,
  prevSlide,
  playVideo;

  /// Convert to WebSocket action string
  String toAction() {
    switch (this) {
      case Command.nextSlide:
        return 'NEXT_SLIDE';
      case Command.prevSlide:
        return 'PREV_SLIDE';
      case Command.playVideo:
        return 'PLAY_VIDEO';
    }
  }

  /// Parse from WebSocket action string
  static Command? fromAction(String action) {
    switch (action) {
      case 'NEXT_SLIDE':
        return Command.nextSlide;
      case 'PREV_SLIDE':
        return Command.prevSlide;
      case 'PLAY_VIDEO':
        return Command.playVideo;
      default:
        return null;
    }
  }
}
```

### 6.2 Constants (`utils/constants.dart`)

```dart
class Constants {
  // Volume button detection
  static const Duration simultaneousPressWindow = Duration(milliseconds: 300);

  // WebSocket reconnection
  static const Duration baseReconnectDelay = Duration(seconds: 1);
  static const int maxReconnectAttempts = 10;

  // Heartbeat
  static const Duration heartbeatInterval = Duration(seconds: 30);

  // MethodChannel
  static const String volumeChannel = 'com.pptremote/volume';
}
```

---

## 7. Keep-Alive & Background Behavior

### Android
- The app should use a `WakeLock` to prevent the screen from sleeping during active use
- Consider using `flutter_foreground_task` if the app needs to run while screen is off (optional)
- WebSocket connection is maintained via `web_socket_channel` which uses a background isolate

### iOS
- iOS aggressively suspends background apps
- The WebSocket connection may drop when the app is backgrounded
- Handle by reconnecting in `WidgetsBindingObserver.didChangeAppLifecycleState`:

```dart
@override
void didChangeAppLifecycleState(AppLifecycleState state) {
  if (state == AppLifecycleState.resumed) {
    // Reconnect if disconnected
    if (!_wsService.isConnected) {
      _wsService.connect(_serverUrl, _code);
    }
  }
}
```

---

## 8. Permissions

### Android (`AndroidManifest.xml`)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- No other permissions needed -->
```

### iOS (`Info.plist`)

```xml
<!-- NSAppTransportSecurity for local network HTTP (non-HTTPS) -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```

**Note:** The app only needs INTERNET permission. No camera, storage, or microphone access required.

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|----------|---------|
| Invalid code entered | Show inline error "Session not found" from REST validation |
| Server unreachable | Show error "Cannot reach server. Check URL and connection." |
| Presenter not connected | Show warning "Presenter not connected yet. Commands will queue." |
| WebSocket drops mid-session | Auto-reconnect with backoff, show "Reconnecting..." status |
| Session expires during use | Show dialog "Session expired", navigate back to connect screen |
| Volume buttons don't work (rare devices) | Manual on-screen Next/Prev/Play buttons as fallback |
| App backgrounded and resumed | Reconnect WebSocket, re-sync current slide state |
| Rapid button presses | Debounce at 300ms; excess presses during debounce are ignored |

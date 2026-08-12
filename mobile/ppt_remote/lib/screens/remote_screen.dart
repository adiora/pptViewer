import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/command.dart';
import '../services/volume_button_service.dart';
import '../services/websocket_service.dart';

class RemoteScreen extends StatefulWidget {
  const RemoteScreen({super.key});

  @override
  State<RemoteScreen> createState() => _RemoteScreenState();
}

class _RemoteScreenState extends State<RemoteScreen> with WidgetsBindingObserver {
  late WebSocketService _wsService;
  late VolumeButtonService _volumeService;

  StreamSubscription? _wsMessageSub;
  StreamSubscription? _volumeSub;

  String _code = '';
  String _serverUrl = '';
  int _currentSlide = 1;
  int _totalSlides = 1;
  bool _presenterConnected = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>;
      _code = args['code'] ?? '';
      _serverUrl = args['serverUrl'] ?? '';
      _totalSlides = args['slideCount'] ?? 1;

      // 1. Obtain Services
      _wsService = context.read<WebSocketService>();
      _volumeService = context.read<VolumeButtonService>();

      // 2. Connect WebSocket as Controller
      _wsService.connect(_serverUrl, _code);

      // 3. Subscribe to WebSocket Messages
      _wsMessageSub = _wsService.messages.listen(_handleWsMessage);

      // 4. Subscribe to Hardware Volume Button Events
      _volumeSub = _volumeService.commands.listen(_handleVolumeCommand);
    });
  }

  void _handleWsMessage(Map<String, dynamic> msg) {
    if (!mounted) return;

    switch (msg['type']) {
      case 'JOINED':
        setState(() {
          _currentSlide = msg['currentSlide'] ?? 1;
          _totalSlides = msg['slideCount'] ?? _totalSlides;
          _presenterConnected = msg['peers']?['presenter'] ?? false;
        });
        break;

      case 'SLIDE_SYNC':
        setState(() {
          _currentSlide = msg['currentSlide'] ?? _currentSlide;
          _totalSlides = msg['totalSlides'] ?? _totalSlides;
        });
        HapticFeedback.lightImpact();
        break;

      case 'PEER_CONNECTED':
        if (msg['role'] == 'presenter') {
          setState(() => _presenterConnected = true);
          HapticFeedback.mediumImpact();
        }
        break;

      case 'PEER_DISCONNECTED':
        if (msg['role'] == 'presenter') {
          setState(() => _presenterConnected = false);
        }
        break;

      case 'SESSION_EXPIRED':
        _showExpiredDialog();
        break;
    }
  }

  void _handleVolumeCommand(Command command) {
    if (!_wsService.isConnected) return;

    // Trigger command over WebSocket
    _wsService.sendCommand(command);

    // Haptic feedback per command
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

  void _showExpiredDialog() {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.timer_off_rounded, color: Colors.amber),
            SizedBox(width: 8),
            Text('Session Expired'),
          ],
        ),
        content: const Text('This 24-hour presentation session has expired and been cleaned up by the server.'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pop(context);
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-establish WebSocket connection when resuming app from background
    if (state == AppLifecycleState.resumed && !_wsService.isConnected && _code.isNotEmpty) {
      _wsService.connect(_serverUrl, _code);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _wsMessageSub?.cancel();
    _volumeSub?.cancel();
    super.dispose();
  }

  void _disconnectAndExit() {
    _wsService.disconnect();
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final wsState = context.watch<WebSocketService>();
    final progress = _totalSlides > 0 ? (_currentSlide / _totalSlides).clamp(0.0, 1.0) : 0.0;

    return Scaffold(
      appBar: AppBar(
        title: Text('Remote Control ($_code)'),
        centerTitle: true,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.power_settings_new_rounded),
            tooltip: 'Disconnect',
            onPressed: _disconnectAndExit,
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Connection Status Header Bar
              Card(
                color: Colors.white.withValues(alpha: 0.04),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: wsState.isConnected
                              ? const Color(0xFF10B981)
                              : Colors.amber,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              wsState.statusMessage,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              _presenterConnected ? 'Presenter Screen Active' : 'Waiting for Presenter Screen...',
                              style: TextStyle(
                                fontSize: 11,
                                color: _presenterConnected ? Colors.greenAccent : Colors.white54,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const Spacer(),

              // Slide Counter Card
              Card(
                elevation: 6,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36.0, horizontal: 24.0),
                  child: Column(
                    children: [
                      const Text(
                        'CURRENT SLIDE',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.white54,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 12),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '$_currentSlide',
                            style: TextStyle(
                              fontSize: 64,
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                          Text(
                            ' / $_totalSlides',
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w500,
                              color: Colors.white60,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 24),

                      // Linear Progress Bar
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: progress,
                          minHeight: 8,
                          backgroundColor: Colors.white10,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const Spacer(),

              // Hardware Volume Keys Guide Box
              Card(
                color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3),
                  ),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.volume_up_rounded, size: 20),
                          SizedBox(width: 8),
                          Text(
                            'HARDWARE VOLUME BUTTONS ACTIVE',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _ControlHint(icon: Icons.add_circle_outline, label: 'Vol ▲', action: 'Next Slide'),
                          _ControlHint(icon: Icons.remove_circle_outline, label: 'Vol ▼', action: 'Prev Slide'),
                          _ControlHint(icon: Icons.play_circle_outline, label: 'Both', action: 'Play Video'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Manual On-Screen Fallback Buttons
              Card(
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'MANUAL ON-SCREEN FALLBACK CONTROLS',
                        style: TextStyle(fontSize: 10, color: Colors.white38, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _handleVolumeCommand(Command.prevSlide),
                              icon: const Icon(Icons.arrow_back_ios_rounded, size: 16),
                              label: const Text('Prev'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filledTonal(
                            onPressed: () => _handleVolumeCommand(Command.playVideo),
                            icon: const Icon(Icons.play_arrow_rounded),
                            tooltip: 'Play/Pause Video',
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => _handleVolumeCommand(Command.nextSlide),
                              icon: const Icon(Icons.arrow_forward_ios_rounded, size: 16),
                              label: const Text('Next'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),

              TextButton.icon(
                onPressed: _disconnectAndExit,
                icon: const Icon(Icons.logout_rounded, size: 18, color: Colors.white54),
                label: const Text(
                  'Disconnect Remote',
                  style: TextStyle(color: Colors.white54),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ControlHint extends StatelessWidget {
  final IconData icon;
  final String label;
  final String action;

  const _ControlHint({
    required this.icon,
    required this.label,
    required this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 22, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
        Text(
          action,
          style: const TextStyle(fontSize: 11, color: Colors.white60),
        ),
      ],
    );
  }
}

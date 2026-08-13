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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>;
      _code = args['code'] ?? '';
      _serverUrl = args['serverUrl'] ?? '';
      _totalSlides = args['slideCount'] ?? 1;

      _wsService = context.read<WebSocketService>();
      _volumeService = context.read<VolumeButtonService>();

      _wsService.connect(_serverUrl, _code);
      _wsMessageSub = _wsService.messages.listen(_handleWsMessage);
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
        });
        break;
      case 'SLIDE_SYNC':
        setState(() {
          _currentSlide = msg['currentSlide'] ?? _currentSlide;
          _totalSlides = msg['totalSlides'] ?? _totalSlides;
        });
        HapticFeedback.lightImpact();
        break;
      case 'SESSION_EXPIRED':
        Navigator.pop(context);
        break;
    }
  }

  void _handleVolumeCommand(Command command) {
    if (!_wsService.isConnected) return;
    _wsService.sendCommand(command);
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
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      _wsService.disconnect();
    } else if (state == AppLifecycleState.resumed) {
      if (!_wsService.isConnected && _serverUrl.isNotEmpty && _code.isNotEmpty) {
        _wsService.connect(_serverUrl, _code);
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _wsMessageSub?.cancel();
    _volumeSub?.cancel();
    _wsService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wsState = context.watch<WebSocketService>();

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0F),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            _wsService.disconnect();
            Navigator.pop(context);
          },
        ),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Card(
              elevation: 4,
              color: const Color(0xFF1A1A2E),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: Colors.white10),
              ),
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Remote Control',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    
                    Text(
                      wsState.isConnected ? 'Connected' : wsState.statusMessage,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        color: wsState.isConnected ? Colors.greenAccent : Colors.orangeAccent,
                      ),
                    ),
                    const SizedBox(height: 32),

                    Text(
                      'Slide $_currentSlide / $_totalSlides',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                        color: Colors.white70,
                      ),
                    ),
                    const SizedBox(height: 24),

                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => _handleVolumeCommand(Command.prevSlide),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              side: BorderSide(color: Theme.of(context).colorScheme.primary),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: const Text('Prev', style: TextStyle(fontSize: 16)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => _handleVolumeCommand(Command.nextSlide),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              side: BorderSide(color: Theme.of(context).colorScheme.primary),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: const Text('Next', style: TextStyle(fontSize: 16)),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    OutlinedButton(
                      onPressed: () => _handleVolumeCommand(Command.playVideo),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        side: BorderSide(color: Theme.of(context).colorScheme.primary),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('Play/Pause Video', style: TextStyle(fontSize: 16)),
                    ),

                    const SizedBox(height: 24),

                    const Text(
                      "Ensure your phone's volume is up (but silent) to use physical volume buttons for navigation.",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white54,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

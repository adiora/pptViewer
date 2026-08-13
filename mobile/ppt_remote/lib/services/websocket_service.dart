import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/io.dart';
import '../models/command.dart';
import '../utils/constants.dart';

class WebSocketService extends ChangeNotifier {
  WebSocketChannel? _channel;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();

  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  String? _code;

  bool _isConnected = false;
  bool _intentionalClose = false;
  String _statusMessage = 'Disconnected';
  
  bool _tryWss = false;
  int _urlIndex = 0;
  
  final List<String> _fallbackUrls = [
    'slides.77128877.xyz',
  ];

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  bool get isConnected => _isConnected;
  String get statusMessage => _statusMessage;

  void connect(String serverUrl, String code) {
    _code = code.trim().toUpperCase();
    _intentionalClose = false;
    _reconnectAttempts = 0;
    _tryWss = false;
    _urlIndex = 0;
    _statusMessage = 'Connecting...';
    notifyListeners();

    _establishConnection();
  }

  Future<void> _establishConnection() async {
    if (_code == null) return;

    try {
      final scheme = _tryWss ? 'wss' : 'ws';
      final hostPort = _fallbackUrls[_urlIndex];
      final wsUrl = '$scheme://$hostPort/ws?code=$_code&role=controller';

      debugPrint('[WS] Connecting to: $wsUrl');

      // Use dart:io WebSocket to bypass self-signed certificate issues
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 4); // Fast fail for fallback testing
      client.badCertificateCallback = (X509Certificate cert, String host, int port) => true;
      
      final socket = await WebSocket.connect(wsUrl, customClient: client).timeout(const Duration(seconds: 5));
      _channel = IOWebSocketChannel(socket);

      _channel!.stream.listen(
        (data) {
          _reconnectAttempts = 0;
          try {
            final message = jsonDecode(data as String) as Map<String, dynamic>;
            _messageController.add(message);

            if (message['type'] == 'JOINED') {
              _isConnected = true;
              _statusMessage = 'Connected';
              notifyListeners();
            }
          } catch (e) {
            debugPrint('[WS] Parse error: $e');
          }
        },
        onError: (error) {
          debugPrint('[WS] Stream Error: $error');
          _triggerFallback();
        },
        onDone: () {
          debugPrint('[WS] Connection closed');
          _isConnected = false;
          notifyListeners();
          if (!_intentionalClose) {
            _handleDisconnect('Disconnected from server');
          }
        },
      );

      // Start heartbeat
      _heartbeatTimer?.cancel();
      _heartbeatTimer = Timer.periodic(Constants.heartbeatInterval, (_) {
        if (_channel != null && _isConnected) {
          try {
            _channel!.sink.add(jsonEncode({'type': 'HEARTBEAT'}));
          } catch (_) {}
        }
      });
      
    } catch (e) {
      debugPrint('[WS] Setup failed: $e');
      _triggerFallback();
    }
  }

  void _triggerFallback() {
    if (_intentionalClose) return;
    
    // Auto-fallback logic
    if (!_tryWss) {
      debugPrint('[WS] ws:// failed, falling back to wss://');
      _tryWss = true;
      _establishConnection();
      return;
    }

    // If both ws and wss failed, try the next URL in the fallback list
    if (_urlIndex < _fallbackUrls.length - 1) {
      _urlIndex++;
      _tryWss = false; // Reset scheme for the new URL
      debugPrint('[WS] Both failed for ${_fallbackUrls[_urlIndex - 1]}, trying ${_fallbackUrls[_urlIndex]}');
      _establishConnection();
      return;
    }

    _handleDisconnect('Failed to reach server');
  }

  void sendCommand(Command command) {
    if (_channel == null || !_isConnected) return;

    final payload = jsonEncode({
      'type': 'COMMAND',
      'action': command.toAction(),
    });

    _channel!.sink.add(payload);
    debugPrint('[WS] Sent command: ${command.toAction()}');
  }

  void _handleDisconnect([String? reason]) {
    _isConnected = false;
    _heartbeatTimer?.cancel();
    _statusMessage = reason ?? 'Disconnected';
    notifyListeners();

    if (_intentionalClose || _reconnectAttempts >= Constants.maxReconnectAttempts) {
      return;
    }

    _reconnectAttempts++;
    final delayMillis = (Constants.baseReconnectDelay.inMilliseconds * (1 << (_reconnectAttempts - 1))).clamp(0, 30000);
    final delay = Duration(milliseconds: delayMillis);

    _statusMessage = 'Reconnecting in ${delay.inSeconds}s...';
    notifyListeners();

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      _establishConnection();
    });
  }

  void disconnect() {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _channel?.sink.close();
    _isConnected = false;
    _statusMessage = 'Disconnected';
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    _messageController.close();
    super.dispose();
  }
}

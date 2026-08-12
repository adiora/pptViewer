import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/command.dart';
import '../utils/constants.dart';

/// Service managing WebSocket connection to the PPT Viewer server as a mobile controller.
class WebSocketService extends ChangeNotifier {
  WebSocketChannel? _channel;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();

  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  String? _serverUrl;
  String? _code;

  bool _isConnected = false;
  bool _intentionalClose = false;
  String _statusMessage = 'Disconnected';

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  bool get isConnected => _isConnected;
  String get statusMessage => _statusMessage;

  /// Connect to the server WebSocket endpoint
  void connect(String serverUrl, String code) {
    _serverUrl = serverUrl;
    _code = code.trim().toUpperCase();
    _intentionalClose = false;
    _reconnectAttempts = 0;
    _statusMessage = 'Connecting...';
    notifyListeners();

    _establishConnection();
  }

  void _establishConnection() {
    if (_serverUrl == null || _code == null) return;

    try {
      final httpUri = Uri.parse(_serverUrl!);
      final wsScheme = httpUri.scheme == 'https' ? 'wss' : 'ws';

      // Build WS URL: ws://<host>:<port>/ws?code=<CODE>&role=controller
      final portString = httpUri.hasPort ? ':${httpUri.port}' : '';
      final wsUrl = '$wsScheme://${httpUri.host}$portString/ws?code=$_code&role=controller';

      debugPrint('[WS] Connecting to: $wsUrl');
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

      _channel!.stream.listen(
        (data) {
          _reconnectAttempts = 0;
          try {
            final message = jsonDecode(data as String) as Map<String, dynamic>;
            _messageController.add(message);

            if (message['type'] == 'JOINED') {
              _isConnected = true;
              _statusMessage = 'Connected to presentation';
              notifyListeners();
            }
          } catch (e) {
            debugPrint('[WS] Parse error: $e');
          }
        },
        onError: (error) {
          debugPrint('[WS] Error: $error');
          _handleDisconnect('Connection error');
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

      // Start heartbeat to keep connection alive
      _heartbeatTimer?.cancel();
      _heartbeatTimer = Timer.periodic(Constants.heartbeatInterval, (_) {
        if (_channel != null && _isConnected) {
          try {
            _channel!.sink.add('ping');
          } catch (_) {}
        }
      });
    } catch (e) {
      debugPrint('[WS] Setup failed: $e');
      _handleDisconnect('Failed to reach server');
    }
  }

  /// Send navigation or video playback command to server
  void sendCommand(Command command) {
    if (_channel == null || !_isConnected) return;

    final payload = jsonEncode({
      'type': 'COMMAND',
      'action': command.toAction(),
    });

    _channel!.sink.add(payload);
    debugPrint('[WS] Sent command: ${command.toAction()}');
  }

  /// Auto-reconnect with exponential backoff logic
  void _handleDisconnect([String? reason]) {
    _isConnected = false;
    _heartbeatTimer?.cancel();
    _statusMessage = reason ?? 'Disconnected';
    notifyListeners();

    if (_intentionalClose || _reconnectAttempts >= Constants.maxReconnectAttempts) {
      return;
    }

    _reconnectAttempts++;
    final delayMillis = (Constants.baseReconnectDelay.inMilliseconds * (1 << (_reconnectAttempts - 1)))
        .clamp(0, 30000);
    final delay = Duration(milliseconds: delayMillis);

    _statusMessage = 'Reconnecting in ${delay.inSeconds}s (Attempt $_reconnectAttempts/${Constants.maxReconnectAttempts})...';
    notifyListeners();

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      _establishConnection();
    });
  }

  /// Intentional manual disconnect
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

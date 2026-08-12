/// Centralized application constants and configurations.
class Constants {
  // Volume button gesture detection window
  static const Duration simultaneousPressWindow = Duration(milliseconds: 300);

  // WebSocket reconnection options
  static const Duration baseReconnectDelay = Duration(seconds: 1);
  static const int maxReconnectAttempts = 10;

  // Heartbeat keep-alive
  static const Duration heartbeatInterval = Duration(seconds: 30);

  // Native MethodChannel identifier
  static const String volumeChannel = 'com.pptremote/volume';

  // Session Code Charset validation
  static final RegExp codeCharsetRegex = RegExp(r'^[A-HJ-NP-Z2-9]{6}$');
}

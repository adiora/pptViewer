import 'dart:async';
import 'package:flutter/services.dart';
import '../models/command.dart';
import '../utils/constants.dart';

/// Service intercepting hardware volume button events via platform channels
/// and running a simultaneous press detection algorithm (Vol+ = Next, Vol- = Prev, Both = Play Video).
class VolumeButtonService {
  static const MethodChannel _platform = MethodChannel(Constants.volumeChannel);
  final StreamController<Command> _commandController = StreamController<Command>.broadcast();

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
      // Both volume buttons pressed within 300ms -> PLAY_VIDEO
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
      // Both volume buttons pressed within 300ms -> PLAY_VIDEO
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

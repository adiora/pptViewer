/// Enum representing remote presentation control actions.
enum Command {
  nextSlide,
  prevSlide,
  playVideo;

  /// Convert command enum to WebSocket JSON action string
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

  /// Parse command enum from WebSocket action string
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

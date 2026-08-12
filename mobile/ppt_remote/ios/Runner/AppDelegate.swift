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

    // Observe volume changes via KVO
    volumeObservation = audioSession?.observe(\.outputVolume, options: [.new]) {
      [weak self] _, change in
      guard let self = self, let newVolume = change.newValue else { return }

      if newVolume > self.lastVolume {
        self.volumeChannel?.invokeMethod("volumeUp", arguments: nil)
      } else if newVolume < self.lastVolume {
        self.volumeChannel?.invokeMethod("volumeDown", arguments: nil)
      }

      // Silently reset volume to 0.5 to allow continuous volume presses
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        let volumeView = MPVolumeView(frame: .zero)
        if let slider = volumeView.subviews.first(where: { $0 is UISlider }) as? UISlider {
          slider.value = 0.5
        }
        self.lastVolume = 0.5
      }
    }

    // Suppress iOS native volume overlay HUD by placing hidden MPVolumeView off-screen
    let volumeView = MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 0, height: 0))
    window?.addSubview(volumeView)
  }
}

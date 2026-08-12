package com.example.ppt_remote

import android.view.KeyEvent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.pptremote/volume"

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_VOLUME_UP -> {
                    flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
                        MethodChannel(messenger, CHANNEL).invokeMethod("volumeUp", null)
                    }
                    return true // Consume event — don't change system volume
                }
                KeyEvent.KEYCODE_VOLUME_DOWN -> {
                    flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
                        MethodChannel(messenger, CHANNEL).invokeMethod("volumeDown", null)
                    }
                    return true // Consume event
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
}

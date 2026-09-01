package com.symbio.fitcoach

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.symbio.fitcoach.nativebridge.FitCoachNativePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register before BridgeActivity builds its bridge so the local plugin is
        // available as window.Capacitor.Plugins.FitCoachNative on first load.
        registerPlugin(FitCoachNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}

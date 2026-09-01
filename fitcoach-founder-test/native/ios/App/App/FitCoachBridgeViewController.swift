import Capacitor

final class FitCoachBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Register the app-local instance explicitly after the bridge loads.
        // Capacitor 8 does not register this source-only plugin through npm discovery.
        bridge?.registerPluginInstance(FitCoachNativePlugin())
    }
}

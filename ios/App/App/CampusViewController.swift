import UIKit
import Capacitor

/// Registers CampusOS's app-local native plugins with the Capacitor bridge.
class CampusViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CampusAppleSignInPlugin())
    }
}

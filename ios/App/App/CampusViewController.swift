import UIKit
import Capacitor

/// Registers CampusOS's app-local native plugins with the Capacitor bridge.
class CampusViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CampusAppleSignInPlugin())

        // Native surface behind the web view (visible during launch, rotation and keyboard transitions).
        // Matches --bg in app/theme.css for light and dark, following the system appearance.
        let background = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x0f / 255, green: 0x15 / 255, blue: 0x12 / 255, alpha: 1)
                : UIColor(red: 0xf7 / 255, green: 0xf8 / 255, blue: 0xf4 / 255, alpha: 1)
        }
        view.backgroundColor = background
        webView?.isOpaque = false
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background
    }
}

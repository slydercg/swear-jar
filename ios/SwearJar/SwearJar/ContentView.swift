import SwiftUI
import WebKit
import LocalAuthentication

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea(.container, edges: .bottom)
            .statusBarHidden(false)
    }
}

struct WebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        config.websiteDataStore = .default()

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        // Register native message handlers
        let contentController = config.userContentController
        contentController.add(context.coordinator, name: "haptic")
        contentController.add(context.coordinator, name: "biometric")
        contentController.add(context.coordinator, name: "icloudSave")
        contentController.add(context.coordinator, name: "icloudLoad")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 13/255, green: 13/255, blue: 26/255, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.bounces = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.allowsBackForwardNavigationGestures = false

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebApp") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }

        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "haptic":
                triggerHaptic(style: message.body as? String ?? "light")

            case "biometric":
                authenticateBiometric { success in
                    DispatchQueue.main.async {
                        self.webView?.evaluateJavaScript("_biometricCallback(\(success))", completionHandler: nil)
                    }
                }

            case "icloudSave":
                if let data = message.body as? String {
                    NSUbiquitousKeyValueStore.default.set(data, forKey: "swearjar-backup")
                    NSUbiquitousKeyValueStore.default.synchronize()
                }

            case "icloudLoad":
                let data = NSUbiquitousKeyValueStore.default.string(forKey: "swearjar-backup") ?? ""
                DispatchQueue.main.async {
                    self.webView?.evaluateJavaScript("_icloudLoadCallback('\(data.replacingOccurrences(of: "'", with: "\\'"))')", completionHandler: nil)
                }

            default:
                break
            }
        }

        private func triggerHaptic(style: String) {
            switch style {
            case "heavy":
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            case "medium":
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "success":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "error":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            default:
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }

        private func authenticateBiometric(completion: @escaping (Bool) -> Void) {
            let context = LAContext()
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                completion(false)
                return
            }
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                   localizedReason: "Authenticate to access admin settings") { success, _ in
                completion(success)
            }
        }
    }
}

#Preview {
    ContentView()
}

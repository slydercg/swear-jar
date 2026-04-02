import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea(.container, edges: .bottom)
            .statusBarHidden(false)
    }
}

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []

        // Enable localStorage persistence
        config.websiteDataStore = .default()

        // Allow file access for local web app
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 13/255, green: 13/255, blue: 26/255, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.bounces = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.allowsBackForwardNavigationGestures = false

        // Load the bundled web app
        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebApp") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

#Preview {
    ContentView()
}

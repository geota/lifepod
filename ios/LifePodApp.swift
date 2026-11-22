import SwiftUI
import WebKit

private let trackerBackgroundColor = UIColor(red: 20.0 / 255, green: 25.0 / 255, blue: 22.0 / 255, alpha: 1)
private let gameKey = "currentGame"

@main
struct LifePodApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            TrackerView(isActive: scenePhase == .active)
                .ignoresSafeArea(.container)
                .background(Color(uiColor: trackerBackgroundColor).ignoresSafeArea())
                .preferredColorScheme(.dark)
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

private struct TrackerView: UIViewRepresentable {
    let isActive: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = config.userContentController
        controller.add(context.coordinator, name: "game")
        controller.add(context.coordinator, name: "keepAwake")
        controller.add(context.coordinator, name: "haptic")

        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.underPageBackgroundColor = trackerBackgroundColor
        view.scrollView.backgroundColor = trackerBackgroundColor
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
        #if DEBUG
            // Lets Safari's Web Inspector attach to Debug builds. Release builds stay closed to it.
            view.isInspectable = true
        #endif
        context.coordinator.setActive(isActive)
        context.coordinator.loadTracker(in: view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.setActive(isActive)
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.setActive(false)
        let controller = view.configuration.userContentController
        controller.removeScriptMessageHandler(forName: "game")
        controller.removeScriptMessageHandler(forName: "keepAwake")
        controller.removeScriptMessageHandler(forName: "haptic")
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let startPage = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")
        private var isActive = false
        private var keepAwake = true
        private let haptics = UISelectionFeedbackGenerator()
        private weak var webView: WKWebView?

        override init() {
            super.init()
            // iOS WebKit has no prefers-reduced-transparency, so the page hears Reduce Transparency from here: at load
            // (loadTracker) and whenever it changes. The Glass style draws solid surfaces while it's on.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(reduceTransparencyChanged),
                name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
                object: nil
            )
        }

        @objc private func reduceTransparencyChanged() {
            let enabled = UIAccessibility.isReduceTransparencyEnabled
            webView?.evaluateJavaScript("window.setReduceTransparency?.(\(enabled));", completionHandler: nil)
        }

        func setActive(_ active: Bool) {
            isActive = active
            updateIdleTimer()
        }

        private func updateIdleTimer() {
            UIApplication.shared.isIdleTimerDisabled = keepAwake && isActive
        }

        func webView(
            _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            let localPage = action.request.url?.standardizedFileURL == startPage?.standardizedFileURL
            decisionHandler(localPage && action.targetFrame?.isMainFrame == true ? .allow : .cancel)
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame else { return }
            switch (message.name, message.body) {
            case ("game", let snapshot as String):
                UserDefaults.standard.set(snapshot, forKey: gameKey)
            case ("keepAwake", let enabled as Bool):
                keepAwake = enabled
                updateIdleTimer()
            case ("haptic", _):
                haptics.selectionChanged()
            default:
                break
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loadTracker(in: webView)
        }

        func loadTracker(in webView: WKWebView) {
            guard let file = startPage else { return }
            self.webView = webView
            let controller = webView.configuration.userContentController
            controller.removeAllUserScripts()
            controller.addUserScript(
                WKUserScript(
                    source: "window.initialReduceTransparency = \(UIAccessibility.isReduceTransparencyEnabled);",
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                ))
            if let saved = UserDefaults.standard.string(forKey: gameKey),
                let data = try? JSONEncoder().encode(saved),
                let literal = String(data: data, encoding: .utf8)
            {
                controller.addUserScript(
                    WKUserScript(
                        source: "window.initialGame = \(literal);",
                        injectionTime: .atDocumentStart,
                        forMainFrameOnly: true
                    ))
            }
            webView.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        }
    }
}

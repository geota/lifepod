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

        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.underPageBackgroundColor = trackerBackgroundColor
        view.scrollView.backgroundColor = trackerBackgroundColor
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
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
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let startPage = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")
        private var isActive = false
        private var keepAwake = true

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
            default:
                break
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loadTracker(in: webView)
        }

        func loadTracker(in webView: WKWebView) {
            guard let file = startPage else { return }
            let controller = webView.configuration.userContentController
            controller.removeAllUserScripts()
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

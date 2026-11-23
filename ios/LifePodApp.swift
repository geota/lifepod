import SwiftUI
import WebKit

private let trackerBackgroundColor = UIColor(red: 20.0 / 255, green: 25.0 / 255, blue: 22.0 / 255, alpha: 1)
private let gameKey = "currentGame"

// The page loads from lifepod://app/, served from the bundle's web folder by WebFolderSchemeHandler, so it has a real
// origin: 'self' in its CSP matches, and module scripts load, which they don't from file://.
private let appScheme = "lifepod"
private let appHost = "app"
private let startPage = URL(string: "\(appScheme)://\(appHost)/index.html")!

// A web content process that ends within quickRestart seconds of loading counts as ending on load; after
// maxQuickRestarts such ends in a row the tracker stops reloading. Keep these in step with MainActivity.kt.
private let quickRestart: TimeInterval = 10
private let maxQuickRestarts = 3

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
        config.setURLSchemeHandler(WebFolderSchemeHandler(), forURLScheme: appScheme)
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
        private var isActive = false
        private var keepAwake = true
        private let haptics = UISelectionFeedbackGenerator()
        private weak var webView: WKWebView?
        // When the tracker last loaded, how many times in a row its content process has ended soon after, and the
        // message shown once it has ended too often.
        private var loadedAt = Date.distantPast
        private var quickRestarts = 0
        private var crashNotice: UIView?

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
            // The pinch-free board ignores Dynamic Type, so the page hears the text size from here too, as a scale of
            // the default, and grows settings' and the dialogs' type with it (ACCESSIBILITY.md H1).
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(textSizeChanged),
                name: UIContentSizeCategory.didChangeNotification,
                object: nil
            )
        }

        @objc private func reduceTransparencyChanged() {
            let enabled = UIAccessibility.isReduceTransparencyEnabled
            webView?.evaluateJavaScript("window.setReduceTransparency?.(\(enabled));", completionHandler: nil)
        }

        // Body text's size now over its size at the default, Large (17pt): 1 at Large, about 2 at AX2.
        private var textScale: Double {
            let category = UIApplication.shared.preferredContentSizeCategory
            let traits = UITraitCollection(preferredContentSizeCategory: category)
            return Double(UIFontMetrics(forTextStyle: .body).scaledValue(for: 17, compatibleWith: traits) / 17)
        }

        @objc private func textSizeChanged() {
            webView?.evaluateJavaScript("window.setTextScale?.(\(textScale));", completionHandler: nil)
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
            let localPage = action.request.url == startPage
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

        // The game is saved on every change, so a reload carries on where the page was. A page whose process ends again
        // and again soon after loading would reload forever, so after maxQuickRestarts in a row the tracker stays closed
        // and a native message offers to try again.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            let quick = Date().timeIntervalSince(loadedAt) < quickRestart
            quickRestarts = quick ? quickRestarts + 1 : 0
            if quickRestarts < maxQuickRestarts {
                loadTracker(in: webView)
            } else {
                showCrashNotice(in: webView)
            }
        }

        // English only, like the page.
        private func showCrashNotice(in webView: WKWebView) {
            let message = UILabel()
            message.text =
                "LifePod's page keeps stopping as it opens. Your game is saved. "
                + "Try again, or restart your iPhone if it keeps happening."
            message.textColor = .white
            message.font = .preferredFont(forTextStyle: .title3)
            message.adjustsFontForContentSizeCategory = true
            message.numberOfLines = 0
            message.textAlignment = .center
            let retry = UIButton(
                configuration: .filled(),
                primaryAction: UIAction(title: "Try again") { [weak self, weak webView] _ in
                    guard let self, let webView else { return }
                    self.crashNotice?.removeFromSuperview()
                    self.crashNotice = nil
                    self.quickRestarts = 0
                    self.loadTracker(in: webView)
                })
            let stack = UIStackView(arrangedSubviews: [message, retry])
            stack.axis = .vertical
            stack.alignment = .center
            stack.spacing = 24
            stack.translatesAutoresizingMaskIntoConstraints = false
            let notice = UIView()
            notice.backgroundColor = trackerBackgroundColor
            notice.translatesAutoresizingMaskIntoConstraints = false
            notice.addSubview(stack)
            webView.addSubview(notice)
            let margins = notice.layoutMarginsGuide
            NSLayoutConstraint.activate([
                notice.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
                notice.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
                notice.topAnchor.constraint(equalTo: webView.topAnchor),
                notice.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
                stack.centerXAnchor.constraint(equalTo: margins.centerXAnchor),
                stack.centerYAnchor.constraint(equalTo: margins.centerYAnchor),
                stack.widthAnchor.constraint(lessThanOrEqualTo: margins.widthAnchor),
                message.widthAnchor.constraint(lessThanOrEqualTo: stack.widthAnchor),
            ])
            crashNotice = notice
        }

        func loadTracker(in webView: WKWebView) {
            self.webView = webView
            let controller = webView.configuration.userContentController
            controller.removeAllUserScripts()
            controller.addUserScript(
                WKUserScript(
                    source: "window.initialReduceTransparency = \(UIAccessibility.isReduceTransparencyEnabled);",
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                ))
            controller.addUserScript(
                WKUserScript(
                    source: "window.initialTextScale = \(textScale);",
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
            loadedAt = Date()
            webView.load(URLRequest(url: startPage))
        }
    }
}

// Serves the bundle's web folder at lifepod://app/. Any file there loads if its extension is in mimeTypes; any other
// host, path or type gets a 404. It reads only from the bundle, so the page still can't reach the network.
@MainActor
private final class WebFolderSchemeHandler: NSObject, WKURLSchemeHandler {
    // The types of file the app serves from web/, by extension; keep it in step with MIME_TYPES in MainActivity.kt.
    // Scripts are text/javascript: WebKit runs a module script only with a JavaScript type.
    static let mimeTypes = [
        "html": "text/html",
        "css": "text/css",
        "js": "text/javascript",
        "mjs": "text/javascript",
        "json": "application/json",
        "png": "image/png",
        "svg": "image/svg+xml",
        "woff2": "font/woff2",
        "txt": "text/plain",
    ]

    private let root = Bundle.main.resourceURL?.appending(path: "web", directoryHint: .isDirectory)

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        guard let file = file(for: url), let type = Self.mimeTypes[file.pathExtension],
            let data = try? Data(contentsOf: file)
        else {
            respond(to: task, url: url, status: 404, type: "text/plain", data: Data())
            return
        }
        let charset =
            type.hasPrefix("text/") || type.hasSuffix("json") || type.hasSuffix("xml") ? "; charset=utf-8" : ""
        respond(to: task, url: url, status: 200, type: type + charset, data: data)
    }

    // Every response is sent in full from start, so there's nothing to cancel.
    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

    // The file in web/ for a URL on the app host, or nil for any other URL. The path is percent-decoded first, so an
    // encoded "..%2F" is caught too. Empty segments (as in a leading "//") and segments that start with a dot (".",
    // "..", hidden files) are refused, so a request can't climb out of web/.
    private func file(for url: URL) -> URL? {
        guard let root, url.scheme == appScheme, url.host(percentEncoded: false) == appHost else { return nil }
        let path = url.path(percentEncoded: false)
        guard path.hasPrefix("/") else { return nil }
        let segments = path.dropFirst().split(separator: "/", omittingEmptySubsequences: false)
        guard segments.allSatisfy({ !$0.isEmpty && !$0.hasPrefix(".") && !$0.contains("\\") }) else { return nil }
        let file = segments.reduce(root) { $0.appending(component: $1) }
        // A last check on the resolved path, in case a symbolic link in the bundle points out of web/.
        let inside = file.resolvingSymlinksInPath().pathComponents.starts(
            with: root.resolvingSymlinksInPath().pathComponents)
        return inside ? file : nil
    }

    private func respond(to task: any WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
        let headers = ["Content-Type": type, "Content-Length": String(data.count)]
        guard
            let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)
        else { return }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
}

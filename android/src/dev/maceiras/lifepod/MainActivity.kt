package dev.maceiras.lifepod

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import java.io.ByteArrayInputStream
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView

    // Shown instead of the tracker while the system WebView is older than the page supports.
    private var updateNotice: LinearLayout? = null

    // Registered only while the page has a dialog or seat rotation to close, so the system handles back otherwise.
    private var backCallback: Any? = null

    // Shown instead of the tracker when its renderer keeps dying as the page loads.
    private var crashNotice: LinearLayout? = null

    // When the tracker last loaded, and how many times in a row its renderer has died soon after.
    private var trackerLoadedAt = 0L
    private var quickRestarts = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(BACKGROUND) }

        @Suppress("DEPRECATION")
        window.setDecorFitsSystemWindows(false)
        window.isNavigationBarContrastEnforced = false
        window.attributes =
            window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            }
        root.setOnApplyWindowInsetsListener { view, insets ->
            val padding = insets.getInsets(WindowInsets.Type.captionBar() or WindowInsets.Type.ime())
            view.setPadding(padding.left, padding.top, padding.right, padding.bottom)
            WindowInsets.CONSUMED
        }

        // Only debuggable builds, which build.sh makes when it signs with the debug key, open to chrome://inspect.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        setContentView(root)
        if (webViewIsCurrent()) showTracker() else showUpdateNotice()
    }

    // The page targets Chrome 129 and later (browserslist in package.json). The Android System WebView
    // updates through Google Play, so a phone that has skipped updates is asked to update it instead of drawing a
    // broken board. An unknown version loads the tracker as normal.
    private fun installedWebViewMajor(): Int? =
        WebView
            .getCurrentWebViewPackage()
            ?.versionName
            ?.substringBefore('.')
            ?.toIntOrNull()

    private fun webViewIsCurrent(): Boolean = (installedWebViewMajor() ?: MIN_WEBVIEW_MAJOR) >= MIN_WEBVIEW_MAJOR

    private fun showUpdateNotice() {
        updateNotice =
            showNotice(
                "LifePod needs a newer Android System WebView, version $MIN_WEBVIEW_MAJOR or later. " +
                    "Update Android System WebView (or Chrome) from Google Play, then come back to LifePod.",
                "Open Google Play",
            ) { openWebViewInPlay() }
    }

    // A native message with one button, in place of the tracker. English only, like the page, and build.sh compiles no
    // R class, so the text is written here.
    @Suppress("SetTextI18n")
    private fun showNotice(
        text: String,
        action: String,
        onAction: () -> Unit,
    ): LinearLayout {
        val density = resources.displayMetrics.density
        val gap = (24 * density).toInt()
        val message =
            TextView(this).apply {
                this.text = text
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                gravity = Gravity.CENTER
            }
        val button =
            Button(this).apply {
                this.text = action
                setOnClickListener { onAction() }
            }
        val notice =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(gap, gap, gap, gap)
                addView(message)
                val wrapContent = LinearLayout.LayoutParams.WRAP_CONTENT
                addView(button, LinearLayout.LayoutParams(wrapContent, wrapContent).apply { topMargin = gap })
            }
        val matchParent = FrameLayout.LayoutParams.MATCH_PARENT
        root.addView(notice, FrameLayout.LayoutParams(matchParent, matchParent))
        return notice
    }

    // Opens the WebView provider's page in the Play Store app, or in a browser where there is no Play Store. The app
    // itself makes no network request.
    private fun openWebViewInPlay() {
        val provider = WebView.getCurrentWebViewPackage()?.packageName ?: WEBVIEW_PACKAGE
        val pages = listOf("market://details?id=$provider", "https://play.google.com/store/apps/details?id=$provider")
        for (page in pages) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(page)))
                return
            } catch (_: ActivityNotFoundException) {
                // Try the next way to open it.
            }
        }
    }

    // Back from Google Play with the WebView updated: swap the notice for the tracker.
    override fun onResume() {
        super.onResume()
        val notice = updateNotice ?: return
        if (!webViewIsCurrent()) return
        root.removeView(notice)
        updateNotice = null
        showTracker()
    }

    // Adds a new WebView and loads the tracker in it. The page reads the saved game from GameBridge as it starts.
    private fun showTracker() {
        // JavaScript runs only the bundled files: LocalWebViewClient refuses every other URL.
        @Suppress("SetJavaScriptEnabled")
        webView =
            WebView(this).apply {
                setBackgroundColor(BACKGROUND)
                settings.apply {
                    javaScriptEnabled = true
                    allowFileAccess = false
                    allowContentAccess = false
                    // The board is a multi-touch surface, so pinch and double-tap never zoom it. The system font size
                    // reaches the page through GameBridge.textScale instead of the WebView's text zoom, which would
                    // scale the fitted board too: settings and dialogs grow their type with it (ACCESSIBILITY.md H1).
                    setSupportZoom(false)
                    builtInZoomControls = false
                    textZoom = 100
                }
                addJavascriptInterface(GameBridge(), "LifePodAndroid")
                webViewClient = LocalWebViewClient()
            }
        val matchParent = FrameLayout.LayoutParams.MATCH_PARENT
        root.addView(webView, FrameLayout.LayoutParams(matchParent, matchParent))
        trackerLoadedAt = SystemClock.elapsedRealtime()
        webView.loadUrl(START_URL)
    }

    // A WebView whose renderer has gone can't be used again. Replace it and reload, as iOS does when its web
    // content process ends. The game is saved on every change, so the new page carries on where the old one was. A
    // renderer that dies again and again soon after loading would restart forever, so after MAX_QUICK_RESTARTS in a row
    // the tracker stays closed and a native message offers to try again.
    private fun replaceTracker() {
        setBackHandling(false)
        root.removeView(webView)
        webView.destroy()
        val quick = SystemClock.elapsedRealtime() - trackerLoadedAt < QUICK_RESTART_MS
        quickRestarts = if (quick) quickRestarts + 1 else 0
        if (quickRestarts < MAX_QUICK_RESTARTS) {
            showTracker()
            return
        }
        crashNotice =
            showNotice(
                "LifePod's page keeps stopping as it opens. Your game is saved. Try again, or restart your phone if it " +
                    "keeps happening.",
                "Try again",
            ) { retryTracker() }
    }

    private fun retryTracker() {
        crashNotice?.let { root.removeView(it) }
        crashNotice = null
        quickRestarts = 0
        showTracker()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            window.insetsController?.apply {
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                hide(WindowInsets.Type.systemBars())
            }
        }
    }

    // Android 12L and earlier deliver back presses here instead of to an OnBackInvokedCallback.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION", "GestureBackNavigation")
    override fun onBackPressed() {
        if (!::webView.isInitialized || crashNotice != null) return super.onBackPressed()
        webView.evaluateJavascript(CLOSE_DIALOG) { handled ->
            if (handled != "true") super.onBackPressed()
        }
    }

    private fun setBackHandling(enabled: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val callback = backCallback as? OnBackInvokedCallback
        if (enabled && callback == null) {
            val created = OnBackInvokedCallback { webView.evaluateJavascript(CLOSE_DIALOG, null) }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, created)
            backCallback = created
        } else if (!enabled && callback != null) {
            onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
            backCallback = null
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized && crashNotice == null) {
            (webView.parent as? FrameLayout)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    inner class GameBridge {
        private val preferences = getSharedPreferences("lifepod", MODE_PRIVATE)

        @JavascriptInterface
        fun readGame(): String? = preferences.getString(GAME_KEY, null)

        @JavascriptInterface
        fun writeGame(game: String) {
            preferences.edit().putString(GAME_KEY, game).apply()
        }

        @JavascriptInterface
        fun keepAwake(enabled: Boolean) {
            runOnUiThread {
                val flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                if (enabled) window.addFlags(flag) else window.clearFlags(flag)
            }
        }

        @JavascriptInterface
        fun haptic() {
            runOnUiThread { webView.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
        }

        @JavascriptInterface
        fun setBackHandling(enabled: Boolean) {
            runOnUiThread { this@MainActivity.setBackHandling(enabled) }
        }

        // Settings → Display → Font size. A change recreates the activity, which loads the page again.
        @JavascriptInterface
        fun textScale(): Float = resources.configuration.fontScale
    }

    private inner class LocalWebViewClient : WebViewClient() {
        // Returning true keeps the app running when the system kills the renderer to free memory, or it crashes.
        override fun onRenderProcessGone(
            view: WebView,
            detail: RenderProcessGoneDetail,
        ): Boolean {
            if (view == webView) replaceTracker()
            return true
        }

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean = true

        // Serves web/, which build.sh packs as the APK's assets, at https://ASSET_HOST/. Any file there loads if its
        // extension is in MIME_TYPES. Any other host, path or type gets a 404, so the page can't reach the network.
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse {
            val path = assetPath(request.url)
            val mimeType = path?.let { MIME_TYPES[it.substringAfterLast('.', "")] }
            if (path != null && mimeType != null) {
                try {
                    val encoding = if (mimeType == "image/png" || mimeType.startsWith("font/")) null else "UTF-8"
                    return WebResourceResponse(mimeType, encoding, assets.open(path))
                } catch (_: IOException) {
                    // Treat a missing asset like an unavailable URL.
                }
            }
            return WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not Found",
                emptyMap(),
                ByteArrayInputStream(byteArrayOf()),
            )
        }
    }

    // The asset path for a URL on the app's asset host, or null for any other URL. Uri.path is percent-decoded, so an
    // encoded "..%2F" is caught too. Empty segments (as in a leading "//") and segments that start with a dot (".",
    // "..", hidden files) are refused, so a request can't climb out of the asset root.
    private fun assetPath(url: Uri): String? {
        if (url.scheme != "https" || url.authority != ASSET_HOST) return null
        val path = url.path?.takeIf { it.startsWith("/") } ?: return null
        val segments = path.substring(1).split('/')
        if (segments.any { it.isEmpty() || it.startsWith('.') || '\\' in it }) return null
        return segments.joinToString("/")
    }

    private companion object {
        val BACKGROUND = Color.rgb(20, 25, 22)
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$ASSET_HOST/index.html"
        const val GAME_KEY = "currentGame"
        const val CLOSE_DIALOG = "window.closeOpenDialog?.()"

        // The oldest WebView the page supports: Chrome 129, from the same month as Safari 18 (September 2024). Keep it
        // in step with the Chrome entry of browserslist in package.json.
        const val MIN_WEBVIEW_MAJOR = 129
        const val WEBVIEW_PACKAGE = "com.google.android.webview"

        // A renderer that dies within QUICK_RESTART_MS of loading counts as dying on load; after MAX_QUICK_RESTARTS
        // such deaths in a row the tracker stops restarting. Keep these in step with ios/LifePodApp.swift.
        const val QUICK_RESTART_MS = 10_000L
        const val MAX_QUICK_RESTARTS = 3

        // The types of file the app serves from web/, by extension; keep it in step with mimeTypes in
        // ios/LifePodApp.swift. Scripts are text/javascript: the WebView runs a module script only with a JavaScript
        // type.
        val MIME_TYPES =
            mapOf(
                "html" to "text/html",
                "css" to "text/css",
                "js" to "text/javascript",
                "mjs" to "text/javascript",
                "json" to "application/json",
                "png" to "image/png",
                "svg" to "image/svg+xml",
                "woff2" to "font/woff2",
                "txt" to "text/plain",
            )
    }
}

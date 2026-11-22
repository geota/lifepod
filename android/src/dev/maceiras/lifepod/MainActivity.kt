package dev.maceiras.lifepod

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Build
import android.os.Bundle
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
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import java.io.ByteArrayInputStream
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView

    // Registered only while the page has a dialog or seat rotation to close, so the system handles back otherwise.
    private var backCallback: Any? = null

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
                    setSupportZoom(false)
                    builtInZoomControls = false
                }
                addJavascriptInterface(GameBridge(), "LifePodAndroid")
                webViewClient = LocalWebViewClient()
            }
        val matchParent = FrameLayout.LayoutParams.MATCH_PARENT
        root.addView(webView, FrameLayout.LayoutParams(matchParent, matchParent))
        webView.loadUrl(START_URL)
    }

    // A WebView whose renderer has gone can't be used again. Replace it and reload, as iOS does when its web
    // content process ends. The game is saved on every change, so the new page carries on where the old one was.
    private fun replaceTracker() {
        setBackHandling(false)
        root.removeView(webView)
        webView.destroy()
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
        (webView.parent as? FrameLayout)?.removeView(webView)
        webView.destroy()
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

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse {
            val url = request.url
            val path = url.path.orEmpty()
            val mimeType = MIME_TYPES[path]
            if (url.scheme == "https" && url.authority == ASSET_HOST && mimeType != null) {
                try {
                    val encoding = if (mimeType.startsWith("image/") || mimeType.startsWith("font/")) null else "UTF-8"
                    return WebResourceResponse(mimeType, encoding, assets.open(path.removePrefix("/")))
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

    private companion object {
        val BACKGROUND = Color.rgb(20, 25, 22)
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$ASSET_HOST/index.html"
        const val GAME_KEY = "currentGame"
        const val CLOSE_DIALOG = "window.closeOpenDialog?.()"
        val MIME_TYPES =
            mapOf(
                "/index.html" to "text/html",
                "/styles.css" to "text/css",
                "/app.js" to "application/javascript",
                "/dice.js" to "application/javascript",
                "/fonts/mana.woff2" to "font/woff2",
                "/icon.png" to "image/png",
                "/favicon-32.png" to "image/png",
            )
    }
}

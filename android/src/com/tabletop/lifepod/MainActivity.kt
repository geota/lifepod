package com.tabletop.lifepod

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import java.io.ByteArrayInputStream
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val background = Color.rgb(20, 25, 22)
        val root = FrameLayout(this).apply { setBackgroundColor(background) }

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

        webView =
            WebView(this).apply {
                setBackgroundColor(background)
                settings.apply {
                    javaScriptEnabled = true
                    allowFileAccess = false
                    allowContentAccess = false
                }
                addJavascriptInterface(GameBridge(), "LifePodAndroid")
                webViewClient = LocalWebViewClient()
            }
        val matchParent = FrameLayout.LayoutParams.MATCH_PARENT
        root.addView(webView, FrameLayout.LayoutParams(matchParent, matchParent))
        setContentView(root)
        webView.loadUrl(START_URL)
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

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        webView.evaluateJavascript("window.closeOpenDialog?.()") { handled ->
            if (handled != "true") super.onBackPressed()
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
        fun readGame(): String? =
            preferences.getString(GAME_KEY, null)
                ?: getSharedPreferences("life-pad", MODE_PRIVATE).getString(GAME_KEY, null)

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
    }

    private inner class LocalWebViewClient : WebViewClient() {
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
                    val encoding = if (mimeType.startsWith("image/")) null else "UTF-8"
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
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$ASSET_HOST/index.html"
        const val GAME_KEY = "currentGame"
        val MIME_TYPES =
            mapOf(
                "/index.html" to "text/html",
                "/styles.css" to "text/css",
                "/app.js" to "application/javascript",
                "/icon.png" to "image/png",
            )
    }
}

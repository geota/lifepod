# R8 rules for build.sh. aapt2 adds the rules that keep the manifest's activity.

# The page calls GameBridge's methods by name through addJavascriptInterface, and WebView exposes only methods that
# still carry @JavascriptInterface at run time. Nothing in the Kotlin code calls them, so without these rules R8
# removes the methods, renames them or drops their annotation, all silently. check-bridge.sh fails the build if
# that happens anyway.
-keepattributes RuntimeVisibleAnnotations
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep names, so crash reports read without a mapping file. Renaming would save only about 200 bytes.
-dontobfuscate

# kotlinc marks parameters with these compile-time annotations. They aren't on the classpath and aren't needed.
-dontwarn org.jetbrains.annotations.**

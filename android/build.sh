#!/usr/bin/env bash
# Builds the LifePod APK and, when bundletool is available, the App Bundle that Google Play requires.
#
# Optional environment:
#   LIFE_POD_KEYSTORE, LIFE_POD_KEYSTORE_PASSWORD   Release key for the APK (GitHub and Obtainium).
#   LIFE_POD_BUNDLETOOL                             Path to bundletool-all.jar. Builds an App Bundle too.
#   LIFE_POD_UPLOAD_KEYSTORE, LIFE_POD_UPLOAD_KEYSTORE_PASSWORD
#                                                   Google Play upload key for the App Bundle.
#   LIFE_POD_VERSION_CODE, LIFE_POD_VERSION_NAME    Defaults are 1 and 1.0.
set -euo pipefail

android_dir=$(cd "$(dirname "$0")" && pwd)
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
if [[ -z "$sdk" ]]; then
    echo 'Set ANDROID_HOME to your Android SDK directory.' >&2
    exit 1
fi

android_jar="$sdk/platforms/android-36/android.jar"
build_tools="$sdk/build-tools/${LIFE_POD_BUILD_TOOLS:-36.1.0}"
if [[ ! -f "$android_jar" || ! -x "$build_tools/aapt2" ]]; then
    echo 'Install Android SDK Platform 36 and Android SDK Build-Tools 36.1.0.' >&2
    exit 1
fi
if ! kotlin_compiler=$(command -v kotlinc); then
    echo 'Install the Kotlin command-line compiler (kotlinc).' >&2
    exit 1
fi
kotlin_dir=${KOTLIN_HOME:-$(cd "$(dirname "$(realpath "$kotlin_compiler")")/.." && pwd)}
kotlin_stdlib="$kotlin_dir/lib/kotlin-stdlib.jar"
if [[ ! -f "$kotlin_stdlib" ]]; then
    echo 'Set KOTLIN_HOME to the Kotlin compiler installation directory.' >&2
    exit 1
fi
bundletool=${LIFE_POD_BUNDLETOOL:-}
if [[ -n "$bundletool" && ! -f "$bundletool" ]]; then
    echo "LIFE_POD_BUNDLETOOL does not point to a file: $bundletool" >&2
    exit 1
fi

output="$android_dir/build"
mkdir -p "$output"
work=$(mktemp -d "$output/work.XXXXXXXX")
trap 'rm -r "$work"' EXIT
mkdir -p "$work/dex"

link() {
    "$build_tools/aapt2" link -I "$android_jar" --manifest "$android_dir/AndroidManifest.xml" \
        --version-code "${LIFE_POD_VERSION_CODE:-1}" --version-name "${LIFE_POD_VERSION_NAME:-1.0}" \
        -A "$android_dir/../web" "$@" "$work/resources.zip"
}

"$build_tools/aapt2" compile --dir "$android_dir/res" -o "$work/resources.zip"
"$kotlin_compiler" -kotlin-home "$kotlin_dir" -jvm-target 11 -no-reflect \
    -classpath "$android_jar:$kotlin_stdlib" -include-runtime \
    -d "$work/classes.jar" "$android_dir/src/dev/maceiras/lifepod/MainActivity.kt"

# R8 drops the parts of the Kotlin runtime the app doesn't use. aapt2 writes the keep rules for the manifest's
# activity; proguard-rules.pro keeps the JavaScript bridge, which only the page calls. check-bridge.sh fails the
# build if the bridge methods went missing anyway, since R8 would strip them without an error.
"$build_tools/aapt2" link -I "$android_jar" --manifest "$android_dir/AndroidManifest.xml" \
    --proguard "$work/manifest-rules.pro" -o "$work/rules.apk" "$work/resources.zip"
java -cp "$build_tools/lib/d8.jar" com.android.tools.r8.R8 --release --min-api 30 --lib "$android_jar" \
    --pg-conf "$android_dir/proguard-rules.pro" --pg-conf "$work/manifest-rules.pro" \
    --output "$work/dex" "$work/classes.jar"
"$android_dir/check-bridge.sh" "$work/dex/classes.dex"

# APK. One signed with the committed debug key is debuggable, which turns on WebView inspection in MainActivity.
# One signed with a release key never is.
apk_debug=--debug-mode
[[ -z "${LIFE_POD_KEYSTORE:-}" ]] || apk_debug=
link ${apk_debug:+"$apk_debug"} -o "$work/unsigned.apk"
zip -q -j "$work/unsigned.apk" "$work/dex/"classes*.dex
"$build_tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

# The committed debug key keeps every debug build installable over the last one. It is not secret.
debug_keystore="$android_dir/debug.keystore"
keystore="$debug_keystore"
keystore_password=pass:android
apk="$output/lifepod-debug.apk"
if [[ -n "${LIFE_POD_KEYSTORE:-}" ]]; then
    : "${LIFE_POD_KEYSTORE_PASSWORD:?Set the Android release keystore password.}"
    keystore="$LIFE_POD_KEYSTORE"
    keystore_password=env:LIFE_POD_KEYSTORE_PASSWORD
    apk="$output/lifepod.apk"
fi
"$build_tools/apksigner" sign --ks "$keystore" --ks-pass "$keystore_password" \
    --key-pass "$keystore_password" --v4-signing-enabled false \
    --out "$apk" "$work/aligned.apk"
echo "$apk"

[[ -n "$bundletool" ]] || exit 0

# App Bundle: bundletool expects a module zip with the manifest, dex, resources and assets in fixed folders.
# Like the APK, it is debuggable unless it is signed with the upload key.
aab_debug=--debug-mode
[[ -z "${LIFE_POD_UPLOAD_KEYSTORE:-}" ]] || aab_debug=
link ${aab_debug:+"$aab_debug"} --proto-format -o "$work/proto.apk"
module="$work/module"
mkdir -p "$module/manifest" "$module/dex"
unzip -q "$work/proto.apk" -d "$module"
mv "$module/AndroidManifest.xml" "$module/manifest/"
cp "$work/dex/"classes*.dex "$module/dex/"
(cd "$module" && zip -q -r -X "$work/base.zip" .)
java -jar "$bundletool" build-bundle --modules="$work/base.zip" --output="$work/unsigned.aab"

if [[ -n "${LIFE_POD_UPLOAD_KEYSTORE:-}" ]]; then
    : "${LIFE_POD_UPLOAD_KEYSTORE_PASSWORD:?Set the Google Play upload keystore password.}"
    upload_keystore="$LIFE_POD_UPLOAD_KEYSTORE"
    upload_password_env=LIFE_POD_UPLOAD_KEYSTORE_PASSWORD
    upload_alias=${LIFE_POD_UPLOAD_KEY_ALIAS:-upload}
    aab="$output/lifepod.aab"
else
    # Google Play rejects debug-signed bundles. This one is only for local checks with bundletool.
    upload_keystore="$debug_keystore"
    export LIFE_POD_DEBUG_PASSWORD=android
    upload_password_env=LIFE_POD_DEBUG_PASSWORD
    upload_alias=androiddebugkey
    aab="$output/lifepod-debug.aab"
fi
jarsigner -storetype PKCS12 -keystore "$upload_keystore" -storepass:env "$upload_password_env" \
    -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$aab" "$work/unsigned.aab" "$upload_alias" >/dev/null
echo "$aab"

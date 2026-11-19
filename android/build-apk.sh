#!/usr/bin/env bash
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

output="$android_dir/build"
mkdir -p "$output"
work=$(mktemp -d "$output/work.XXXXXXXX")
trap 'rm -r "$work"' EXIT
mkdir -p "$work/dex"

"$build_tools/aapt2" compile --dir "$android_dir/res" -o "$work/resources.zip"
"$build_tools/aapt2" link -I "$android_jar" --manifest "$android_dir/AndroidManifest.xml" \
    --version-code "${LIFE_POD_VERSION_CODE:-1}" --version-name "${LIFE_POD_VERSION_NAME:-1.0}" \
    -A "$android_dir/../web" \
    -o "$work/unsigned.apk" "$work/resources.zip"
"$kotlin_compiler" -kotlin-home "$kotlin_dir" -jvm-target 11 -no-reflect \
    -classpath "$android_jar:$kotlin_stdlib" -include-runtime \
    -d "$work/classes.jar" "$android_dir/src/dev/maceiras/lifepod/MainActivity.kt"
"$build_tools/d8" --lib "$android_jar" --min-api 30 --output "$work/dex" "$work/classes.jar"
zip -q -j "$work/unsigned.apk" "$work/dex/"classes*.dex
"$build_tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

# The committed debug key keeps every debug build installable over the last one. It is not secret.
keystore="$android_dir/debug.keystore"
keystore_password=pass:android
apk="$output/lifepod-debug.apk"
if [[ -n "${LIFE_POD_KEYSTORE:-}" ]]; then
    : "${LIFE_POD_KEYSTORE_PASSWORD:?Set the Android release keystore password.}"
    keystore="$LIFE_POD_KEYSTORE"
    keystore_password=env:LIFE_POD_KEYSTORE_PASSWORD
    apk="$output/lifepod.apk"
elif [[ ! -f "$keystore" ]]; then
    keytool -genkeypair -storetype PKCS12 -keystore "$keystore" -storepass android \
        -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 \
        -validity 10000 -dname 'CN=Android Debug,O=Android,C=US'
fi
"$build_tools/apksigner" sign --ks "$keystore" --ks-pass "$keystore_password" \
    --key-pass "$keystore_password" --v4-signing-enabled false \
    --out "$apk" "$work/aligned.apk"
echo "$apk"

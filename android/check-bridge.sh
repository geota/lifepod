#!/usr/bin/env bash
# Fails unless the dex in an APK, or a classes.dex, still has every @JavascriptInterface method that MainActivity.kt
# declares, with the annotation WebView looks for. A wrong R8 keep rule would strip them without any error, and the
# page would lose saving, keep-awake, haptics and back.
#
# Usage: android/check-bridge.sh path/to/lifepod.apk (or classes.dex)
set -euo pipefail

android_dir=$(cd "$(dirname "$0")" && pwd)
input=${1:?Pass the APK or classes.dex to check.}
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
dexdump="$sdk/build-tools/${LIFE_POD_BUILD_TOOLS:-36.1.0}/dexdump"
if [[ -z "$sdk" || ! -x "$dexdump" ]]; then
    echo 'Set ANDROID_HOME and install Android SDK Build-Tools 36.1.0, which has dexdump.' >&2
    exit 1
fi

# The method on the line after each @JavascriptInterface in the source.
expected=$(awk '/@JavascriptInterface/ { getline; if (match($0, /fun [A-Za-z0-9_]+/)) print substr($0, RSTART + 4, RLENGTH - 4) }' \
    "$android_dir/src/dev/maceiras/lifepod/MainActivity.kt" | sort -u)
if [[ -z "$expected" ]]; then
    echo 'Found no @JavascriptInterface methods in MainActivity.kt.' >&2
    exit 1
fi

# The methods dexdump lists with a run-time JavascriptInterface annotation.
# Kotlin metadata strings in the dump aren't valid text, so awk reads bytes.
found=$("$dexdump" -a "$input" | LC_ALL=C awk '
    /^Annotations on method #/ { method = $0; sub(/^[^'\'']*'\''/, "", method); sub(/'\''.*$/, "", method); next }
    /^Annotations on / { method = ""; next }
    method != "" && /VISIBILITY_RUNTIME Landroid\/webkit\/JavascriptInterface;/ { print method }
' | sort -u)

mapfile -t missing < <(comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$found"))
if ((${#missing[@]})); then
    echo "The dex in $input lacks these @JavascriptInterface bridge methods. Check android/proguard-rules.pro:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    exit 1
fi
echo "Bridge methods present in $(basename "$input"): $(paste -sd ' ' - <<< "$expected")"

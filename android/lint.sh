#!/usr/bin/env bash
# Runs Android Lint without Gradle by describing the app in a lint project file.
set -euo pipefail

android_dir=$(cd "$(dirname "$0")" && pwd)
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
if [[ -z "$sdk" ]]; then
    echo 'Set ANDROID_HOME to your Android SDK directory.' >&2
    exit 1
fi
lint="$sdk/cmdline-tools/${LIFE_POD_CMDLINE_TOOLS:-23.0}/bin/lint"
if [[ ! -x "$lint" || ! -f "$sdk/platforms/android-36/android.jar" ]]; then
    echo 'Install Android SDK Command-line Tools 23.0 and Android SDK Platform 36.' >&2
    exit 1
fi
if ! kotlin_compiler=$(command -v kotlinc); then
    echo 'Install the Kotlin command-line compiler (kotlinc).' >&2
    exit 1
fi
kotlin_dir=${KOTLIN_HOME:-$(cd "$(dirname "$(realpath "$kotlin_compiler")")/.." && pwd)}

output="$android_dir/build"
mkdir -p "$output"
project="$output/lint-project.xml"
{
    echo '<project>'
    echo '  <module name="lifepod" android="true" library="false" compile-sdk-version="36">'
    echo "    <manifest file=\"$android_dir/AndroidManifest.xml\" />"
    find "$android_dir/src" -name '*.kt' | sort | sed 's|.*|    <src file="&" />|'
    find "$android_dir/res" -type f | sort | sed 's|.*|    <resource file="&" />|'
    echo "    <classpath file=\"$kotlin_dir/lib/kotlin-stdlib.jar\" />"
    echo '  </module>'
    echo '</project>'
} > "$project"

"$lint" --sdk-home "$sdk" --project "$project" --config "$android_dir/lint.xml" \
    --exitcode -Werror --quiet \
    --text stdout --html "$output/lint-report.html"

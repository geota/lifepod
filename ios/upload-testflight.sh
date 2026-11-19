#!/usr/bin/env bash
# Archives LifePod and uploads it to App Store Connect for TestFlight. Xcode signs it automatically with an
# App Store Connect API key, so no certificates or provisioning profiles are stored anywhere.
#
# Required environment:
#   APPLE_TEAM_ID                 Apple Developer team ID
#   APP_STORE_CONNECT_KEY_ID      API key ID
#   APP_STORE_CONNECT_ISSUER_ID   API key issuer ID
#   APP_STORE_CONNECT_KEY_PATH    Path to the AuthKey .p8 file
#   LIFE_POD_VERSION_NAME         App version, numbers only, such as 0.1.0
#   LIFE_POD_BUILD_NUMBER         Build number; must increase with every upload
set -euo pipefail

ios_dir=$(cd "$(dirname "$0")" && pwd)
for name in APPLE_TEAM_ID APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID APP_STORE_CONNECT_KEY_PATH \
    LIFE_POD_VERSION_NAME LIFE_POD_BUILD_NUMBER; do
    if [[ -z "${!name:-}" ]]; then
        echo "Set $name." >&2
        exit 1
    fi
done
if [[ ! "$LIFE_POD_VERSION_NAME" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]]; then
    echo 'App Store versions are numbers only, such as 0.1.0.' >&2
    exit 1
fi
if [[ ! -f "$APP_STORE_CONNECT_KEY_PATH" ]]; then
    echo "No API key at $APP_STORE_CONNECT_KEY_PATH." >&2
    exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
auth=(
    -allowProvisioningUpdates
    -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH"
    -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID"
    -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"
)

# Archive unsigned, then let the export sign for App Store distribution. Signing the archive itself would need a
# development profile, which Apple only issues once a device is registered to the team.
xcodebuild -project "$ios_dir/LifePod.xcodeproj" -scheme LifePod -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$work/LifePod.xcarchive" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" MARKETING_VERSION="$LIFE_POD_VERSION_NAME" \
    CURRENT_PROJECT_VERSION="$LIFE_POD_BUILD_NUMBER" CODE_SIGNING_ALLOWED=NO archive

cat > "$work/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>upload</string>
    <key>teamID</key>
    <string>$APPLE_TEAM_ID</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive -archivePath "$work/LifePod.xcarchive" -exportOptionsPlist "$work/ExportOptions.plist" \
    -exportPath "$work/export" "${auth[@]}"
echo "Uploaded LifePod $LIFE_POD_VERSION_NAME ($LIFE_POD_BUILD_NUMBER) to App Store Connect."

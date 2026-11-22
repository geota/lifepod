# Releasing LifePod

LifePod ships to GitHub prereleases (installed through Obtainium) and Google Play. Both use the same release key, so a phone can switch between them without reinstalling.

## Secrets

Keys and passwords live in [`pass`](https://www.passwordstore.org/), in a folder of your choosing. Keystores are stored base64-encoded. Set `LIFEPOD_PASS` to that folder before running any command below:

```sh
export LIFEPOD_PASS=your/pass/folder   # placeholder: where LifePod's entries live in your password store
```

| Entry in `$LIFEPOD_PASS` | What it is | GitHub Actions secret |
|---|---|---|
| `android-release-keystore.p12` | Release key (alias `lifepod`). Signs the GitHub APK, and is Google Play's app signing key. | `ANDROID_KEYSTORE_BASE64` |
| `android-release-keystore-password` | Its password | `ANDROID_KEYSTORE_PASSWORD` |
| `android-upload-keystore.p12` | Google Play upload key (alias `upload`). Signs the App Bundle that CI uploads. | `ANDROID_UPLOAD_KEYSTORE_BASE64` |
| `android-upload-keystore-password` | Its password | `ANDROID_UPLOAD_KEYSTORE_PASSWORD` |
| `play-service-account.json` | Google Play API service account key | `PLAY_SERVICE_ACCOUNT_JSON` |
| `app-store-connect-api-key.p8` | App Store Connect API key | `APP_STORE_CONNECT_API_KEY` |

Losing the release key means no update can ever install over existing copies, so push the password store after creating it.

### Create the Android keys

Run once:

```sh
pass generate -n "$LIFEPOD_PASS/android-release-keystore-password" 32
pass generate -n "$LIFEPOD_PASS/android-upload-keystore-password" 32

keys=$(mktemp -d)
LIFEPOD_KEY_PASS=$(pass show "$LIFEPOD_PASS/android-release-keystore-password") \
  keytool -genkeypair -storetype PKCS12 -keystore "$keys/release.p12" -storepass:env LIFEPOD_KEY_PASS \
  -alias lifepod -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=LifePod'
LIFEPOD_KEY_PASS=$(pass show "$LIFEPOD_PASS/android-upload-keystore-password") \
  keytool -genkeypair -storetype PKCS12 -keystore "$keys/upload.p12" -storepass:env LIFEPOD_KEY_PASS \
  -alias upload -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=LifePod Upload'
base64 < "$keys/release.p12" | pass insert -m "$LIFEPOD_PASS/android-release-keystore.p12"
base64 < "$keys/upload.p12" | pass insert -m "$LIFEPOD_PASS/android-upload-keystore.p12"
rm -rf "$keys"
pass git push
```

Print the release key's SHA-256 fingerprint (for Android developer verification):

```sh
keys=$(mktemp -d)
pass show "$LIFEPOD_PASS/android-release-keystore.p12" | base64 --decode > "$keys/release.p12"
LIFEPOD_KEY_PASS=$(pass show "$LIFEPOD_PASS/android-release-keystore-password") \
  keytool -list -v -keystore "$keys/release.p12" -storepass:env LIFEPOD_KEY_PASS -alias lifepod | grep 'SHA256:'
rm -rf "$keys"
```

### Copy the Android secrets to GitHub

```sh
for pair in \
  android-release-keystore.p12:ANDROID_KEYSTORE_BASE64 \
  android-release-keystore-password:ANDROID_KEYSTORE_PASSWORD \
  android-upload-keystore.p12:ANDROID_UPLOAD_KEYSTORE_BASE64 \
  android-upload-keystore-password:ANDROID_UPLOAD_KEYSTORE_PASSWORD
do
  pass show "$LIFEPOD_PASS/${pair%%:*}" | tr -d '\n' | gh secret set "${pair##*:}" --repo geota/lifepod
done
gh secret list --repo geota/lifepod
```

## GitHub prerelease and Obtainium

Push a version tag from a tested commit on `main`:

```sh
git tag -m 'LifePod 0.1.0-alpha.1' v0.1.0-alpha.1   # signed when tag.gpgsign is on
git push origin v0.1.0-alpha.1
sleep 10   # give GitHub a moment to start the run
gh run watch --repo geota/lifepod --exit-status \
  "$(gh run list --repo geota/lifepod --branch v0.1.0-alpha.1 --limit 1 --json databaseId -q '.[0].databaseId')"
gh release view v0.1.0-alpha.1 --repo geota/lifepod --json assets -q '.assets[].name'
```

CI signs `lifepod.apk` with the release key and publishes it with the iOS Simulator and web ZIPs. The tag sets the Android version name, and the workflow run number sets the version code. A phone with a debug build must uninstall it before installing the first signed release.

## Google Play

### Store listing

- Privacy policy: <https://github.com/geota/lifepod/blob/main/PRIVACY.md>
- Listing text: `store/play/listing/` has the app name, short description, and full description.
- Images: `store/play/` has the 512 × 512 icon, the 1024 × 500 feature graphic, and 16:9 phone, 7-inch tablet, and 10-inch tablet screenshots. Regenerate them with `npm run store:images`.
- Ads: none. Data safety: no data collected or shared. Target audience: not children only.

New personal developer accounts must run a closed test with at least 12 testers for 14 days before applying for production.

### Play App Signing with the release key

When Play Console asks how to sign the app, choose to export and upload a key from a Java keystore. Download `pepk.jar` and `encryption_public_key.pem` from that page into `~/Downloads`, then run:

```sh
mkdir -p android/build/play
keys=$(mktemp -d)
pass show "$LIFEPOD_PASS/android-release-keystore.p12" | base64 --decode > "$keys/release.p12"
pass show "$LIFEPOD_PASS/android-upload-keystore.p12" | base64 --decode > "$keys/upload.p12"
pass show -c "$LIFEPOD_PASS/android-release-keystore-password"   # paste at both pepk password prompts
java -jar ~/Downloads/pepk.jar --keystore="$keys/release.p12" --alias=lifepod \
  --output=android/build/play/lifepod-signing-key.zip --include-cert --rsa-aes-encryption \
  --encryption-key-path="$HOME/Downloads/encryption_public_key.pem"
LIFEPOD_KEY_PASS=$(pass show "$LIFEPOD_PASS/android-upload-keystore-password") \
  keytool -export -rfc -keystore "$keys/upload.p12" -storepass:env LIFEPOD_KEY_PASS -alias upload \
  -file android/build/play/upload_certificate.pem
rm -rf "$keys"
```

Upload `lifepod-signing-key.zip` and `upload_certificate.pem`. The zip is encrypted for Google; delete it afterwards with `rm android/build/play/lifepod-signing-key.zip`.

### Upload from CI

Play only accepts API uploads after the first App Bundle is uploaded by hand. Build that bundle locally with the upload key:

```sh
keys=$(mktemp -d)
pass show "$LIFEPOD_PASS/android-release-keystore.p12" | base64 --decode > "$keys/release.p12"
pass show "$LIFEPOD_PASS/android-upload-keystore.p12" | base64 --decode > "$keys/upload.p12"
LIFE_POD_KEYSTORE="$keys/release.p12" \
LIFE_POD_KEYSTORE_PASSWORD=$(pass show "$LIFEPOD_PASS/android-release-keystore-password") \
LIFE_POD_UPLOAD_KEYSTORE="$keys/upload.p12" \
LIFE_POD_UPLOAD_KEYSTORE_PASSWORD=$(pass show "$LIFEPOD_PASS/android-upload-keystore-password") \
LIFE_POD_BUNDLETOOL="$HOME/.local/share/bundletool/bundletool-all-1.18.3.jar" \
LIFE_POD_VERSION_CODE=1 LIFE_POD_VERSION_NAME=0.1.0-alpha.1 \
  ./android/build.sh
rm -rf "$keys"
```

That writes `android/build/lifepod.aab`. Then create a service account for CI and store its key:

```sh
project=lifepod-play-$(openssl rand -hex 3)
gcloud projects create "$project" --name='LifePod Play'
gcloud services enable androidpublisher.googleapis.com --project "$project"
gcloud iam service-accounts create play-upload --project "$project" --display-name='LifePod Play upload'
account="play-upload@$project.iam.gserviceaccount.com"
key=$(mktemp)
gcloud iam service-accounts keys create "$key" --iam-account "$account"
pass insert -m "$LIFEPOD_PASS/play-service-account.json" < "$key"
rm -f "$key"
pass show "$LIFEPOD_PASS/play-service-account.json" | gh secret set PLAY_SERVICE_ACCOUNT_JSON --repo geota/lifepod
pass git push
echo "$account"
```

In Play Console, open **Users and permissions**, invite that account, and give it release permissions for LifePod. After that, each version tag also uploads `lifepod.aab` to Play as a draft on the internal track. To change that, set repository variables, for example:

```sh
gh variable set PLAY_RELEASE_STATUS --body completed --repo geota/lifepod
gh variable set PLAY_TRACK --body production --repo geota/lifepod
```

## App Store

Each version tag also uploads the iOS app to App Store Connect for TestFlight once the key below is set. App Store versions are numbers only, so `v0.1.0-alpha.3` uploads as version 0.1.0, with the workflow run number as its build number.

### One-time setup

1. In [App Store Connect](https://appstoreconnect.apple.com), create the app: platform iOS, name **LifePod: Life Counter**, bundle ID `dev.maceiras.lifepod`, SKU `lifepod`.
2. Under **Users and Access → Integrations → Team Keys**, create a key with the **Admin** role. Xcode's automatic signing needs it to create the distribution certificate. Download `AuthKey_<KEY ID>.p8` (Apple only offers it once) and note the key ID and the issuer ID shown above the list.
3. Find your team ID under **Membership details** at <https://developer.apple.com/account>.

Store the key in `pass` and give CI the key and IDs (replace the placeholders):

```sh
pass insert -m "$LIFEPOD_PASS/app-store-connect-api-key.p8" < ~/Downloads/AuthKey_KEYID.p8
rm ~/Downloads/AuthKey_KEYID.p8
pass git push
pass show "$LIFEPOD_PASS/app-store-connect-api-key.p8" | gh secret set APP_STORE_CONNECT_API_KEY --repo geota/lifepod
gh variable set APPLE_TEAM_ID --body TEAMID --repo geota/lifepod
gh variable set APP_STORE_CONNECT_KEY_ID --body KEYID --repo geota/lifepod
gh variable set APP_STORE_CONNECT_ISSUER_ID --body ISSUER-UUID --repo geota/lifepod
```

The team, key, and issuer IDs aren't secret, so they're repository variables. Only the `.p8` key is a secret.

### Upload from this Mac

CI uploads on every tag. To upload from this Mac instead:

```sh
key=$(mktemp)
pass show "$LIFEPOD_PASS/app-store-connect-api-key.p8" > "$key"
APPLE_TEAM_ID=TEAMID APP_STORE_CONNECT_KEY_ID=KEYID APP_STORE_CONNECT_ISSUER_ID=ISSUER-UUID \
APP_STORE_CONNECT_KEY_PATH="$key" LIFE_POD_VERSION_NAME=0.1.0 LIFE_POD_BUILD_NUMBER=1 \
  ./ios/upload-testflight.sh
rm -f "$key"
```

Each upload needs a higher build number than the last.

### Store listing

- Screenshots: `store/app-store/` has 6.9-inch iPhone and 13-inch iPad sets.
- Minimum: iOS and iPadOS 18.0. App Store Connect reads it from the build's deployment target (`ios/LifePod.xcodeproj`), so there's nothing to set in the listing.
- Privacy policy: <https://github.com/geota/lifepod/blob/main/PRIVACY.md>. Privacy label: Data Not Collected.
- Support URL: <https://github.com/geota/lifepod/issues>
- Age rating: 4+. Price: free.
- Review notes: "LifePod is an offline life counter for tabletop games. It needs no account or network connection; everything is available from launch."

#!/usr/bin/env bash
# One-time generation of the Saviaj Android upload keystore.
# Run this LOCALLY (not in CI). Save the output file securely — losing it
# means you can NEVER push another update to the Play Store listing.
#
# Usage:
#   bash scripts/generate-android-keystore.sh
#
# After generation:
#   1. Move saviaj-upload.keystore to a secure password manager / Azure Key Vault.
#   2. Set GitHub Action / build env vars:
#        SAVIAJ_KEYSTORE_PATH=/abs/path/to/saviaj-upload.keystore
#        SAVIAJ_KEYSTORE_PASSWORD=<store password>
#        SAVIAJ_KEY_ALIAS=saviaj-upload
#        SAVIAJ_KEY_PASSWORD=<key password>
#   3. Print the SHA256 fingerprint for assetlinks.json:
#        keytool -list -v -keystore saviaj-upload.keystore -alias saviaj-upload | grep SHA256
#      Then set ANDROID_APP_SIGNING_FINGERPRINTS in the server env.

set -euo pipefail

OUT="${1:-saviaj-upload.keystore}"
ALIAS="saviaj-upload"

if [ -f "$OUT" ]; then
  echo "Refusing to overwrite existing keystore at $OUT" >&2
  exit 1
fi

keytool -genkey -v \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storetype JKS

echo ""
echo "Keystore created: $OUT"
echo "SHA256 fingerprint (for /.well-known/assetlinks.json):"
keytool -list -v -keystore "$OUT" -alias "$ALIAS" | grep SHA256 || true

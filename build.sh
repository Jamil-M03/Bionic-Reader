#!/usr/bin/env bash
#
# Builds the Bionic Reader extension package for a target browser.
#
#   ./build.sh firefox   -> dist/firefox/ + bionic-reader-firefox.zip   (Manifest V2)
#   ./build.sh chrome    -> dist/chrome/  + bionic-reader-chrome.zip    (Manifest V3)
#
# Everything is shared between the two builds except the manifest
# (manifests/manifest.<target>.json). The extension's own files are plain,
# hand-written source with no build step; the only generated files are the two
# pdf.js library files, fetched unmodified from npm.
#
set -euo pipefail

TARGET="${1:-}"
if [ "$TARGET" != "firefox" ] && [ "$TARGET" != "chrome" ]; then
  echo "Usage: ./build.sh [firefox|chrome]"
  exit 1
fi

PKG="pdfjs-dist"
VER="4.10.38"
OUT="dist/$TARGET"
ZIP="bionic-reader-$TARGET.zip"

command -v node >/dev/null || { echo "ERROR: Node.js is required (>= 18)."; exit 1; }
command -v npm  >/dev/null || { echo "ERROR: npm is required."; exit 1; }
command -v zip  >/dev/null || { echo "ERROR: the 'zip' utility is required."; exit 1; }

echo "Building $TARGET with Node $(node --version) / npm $(npm --version)"

# 1. Fetch the official, unmodified pdf.js library from npm.
echo "Fetching ${PKG}@${VER} from npm ..."
npm pack "${PKG}@${VER}" >/dev/null
tar -xzf "${PKG}-${VER}.tgz"

# 2. Assemble the package.
rm -rf "$OUT"
mkdir -p "$OUT/icons" "$OUT/pdfjs"

# Manifest for this target (the only browser-specific file):
cp "manifests/manifest.$TARGET.json" "$OUT/manifest.json"

# Shared source — copied verbatim, no processing:
cp background.js content.js content.css \
   popup.html popup.js popup.css \
   viewer.html viewer.js viewer.css "$OUT/"

# Icons (PNG; both manifests reference PNGs). 16px is used by Chrome.
cp icons/icon-16.png icons/icon-32.png icons/icon-48.png \
   icons/icon-96.png icons/icon-128.png "$OUT/icons/"

# Third-party library — copied verbatim from the npm package:
cp package/build/pdf.mjs        "$OUT/pdfjs/pdf.mjs"
cp package/build/pdf.worker.mjs "$OUT/pdfjs/pdf.worker.mjs"

# 3. Package it (manifest.json at the zip root).
rm -f "$ZIP"
( cd "$OUT" && zip -r -q "../../$ZIP" . )

# 4. Tidy up the npm tarball/extraction.
rm -rf "${PKG}-${VER}.tgz" package

echo "Done."
echo "  Built extension : ./$OUT/"
echo "  Packaged add-on : ./$ZIP"

#!/usr/bin/env bash
set -e

APP="oscilla"
DIST="dist"

# ------------------------------------------------------------
# Version
# ------------------------------------------------------------

if [[ ! -f VERSION ]]; then
  echo "❌ VERSION file not found"
  exit 1
fi

VERSION=$(tr -d ' \n' < VERSION)

if [[ -z "$VERSION" ]]; then
  echo "❌ VERSION file is empty"
  exit 1
fi

echo "▶ Building $APP v$VERSION"
echo

# ------------------------------------------------------------
# Preconditions
# ------------------------------------------------------------

command -v npx >/dev/null || {
  echo "❌ npx not found (install Node.js)"
  exit 1
}

if command -v ldid >/dev/null; then
  echo "✔ ldid found — macOS binaries will be ad-hoc signed"
else
  echo "⚠ ldid not found — macOS binaries will NOT be signed"
fi

echo

# ------------------------------------------------------------
# Clean
# ------------------------------------------------------------

rm -rf "$DIST"
mkdir -p "$DIST"

# ------------------------------------------------------------
# Bundle ESM → CJS with esbuild
# ------------------------------------------------------------
# pkg doesn't support ES modules natively, so we first bundle
# our ESM code into a single CommonJS file using esbuild.
#
# We use --inject to provide a shim that makes import.meta.url
# work in CommonJS by using __filename.
# ------------------------------------------------------------

echo "▶ Bundling ESM → CJS with esbuild..."

# Create a shim file that esbuild will inject
cat > /tmp/import-meta-shim.js << 'EOF'
// Shim for import.meta.url in CJS
import { pathToFileURL } from 'url';
export const importMetaUrl = pathToFileURL(__filename).href;
EOF

npx esbuild server.js \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=server.cjs \
  --packages=external \
  --inject:/tmp/import-meta-shim.js \
  --define:import.meta.url=importMetaUrl

# Clean up shim
rm -f /tmp/import-meta-shim.js

echo "✔ Bundle created: server.cjs"
echo

# ------------------------------------------------------------
# Build helper
# ------------------------------------------------------------

build () {
  local TARGET="$1"
  local OUT="$2"

  echo "▶ pkg $TARGET → $OUT"
  npx @yao-pkg/pkg server.cjs \
    --targets "$TARGET" \
    --output "$OUT" \
    --config package.json
}

# ------------------------------------------------------------
# Builds (Node 20 LTS - well supported by @yao-pkg/pkg)
# ------------------------------------------------------------

build node20-linux-x64   "$DIST/$APP-$VERSION-linux-x64"
build node20-win-x64     "$DIST/$APP-$VERSION-win-x64.exe"
build node20-macos-x64   "$DIST/$APP-$VERSION-macos-x64"
build node20-macos-arm64 "$DIST/$APP-$VERSION-macos-arm64"

# ------------------------------------------------------------
# Clean up intermediate bundle
# ------------------------------------------------------------

rm -f server.cjs
echo "✔ Cleaned up server.cjs"

# ------------------------------------------------------------
# Verify macOS signatures
# ------------------------------------------------------------

if command -v ldid >/dev/null; then
  echo
  echo "▶ Verifying macOS signatures"
  ldid -e "$DIST/$APP-$VERSION-macos-x64" >/dev/null
  ldid -e "$DIST/$APP-$VERSION-macos-arm64" >/dev/null
  echo "✔ macOS binaries are ad-hoc signed"
fi

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------

echo
echo "✅ Build complete:"
ls -lh "$DIST"
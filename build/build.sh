#!/usr/bin/env bash
set -e

APP="oscilla"
VERSION=$(node -p "require('./package.json').version")

echo "======================================"
echo " Building ${APP} ${VERSION}"
echo "======================================"

rm -rf dist
mkdir -p dist

npx pkg . \
  --targets node18-linux-x64,node18-macos-x64,node18-macos-arm64,node18-win-x64 \
  --out-path dist

echo "Renaming outputs…"

mv dist/oscilla-linux-x64       dist/${APP}-${VERSION}-linux-x64
mv dist/oscilla-macos-x64       dist/${APP}-${VERSION}-macos-x64
mv dist/oscilla-macos-arm64     dist/${APP}-${VERSION}-macos-arm64
mv dist/oscilla-win-x64.exe     dist/${APP}-${VERSION}-win-x64.exe

echo
echo "Build complete:"
ls -lh dist

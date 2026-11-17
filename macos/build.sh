#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
arch="$(uname -m)"
app="build/mac-native/PainPig.app"
rm -rf build/mac-native build/native-ts
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/ui"
npx --yes --package typescript@5.9.3 tsc -p tsconfig.ui.json
npx --yes --package typescript@5.9.3 tsc -p macos/tsconfig.json
cp src/ui/*.html src/ui/*.css "$app/Contents/Resources/ui/"
cp build/ui-ts/ui/*.js "$app/Contents/Resources/ui/"
node macos/prepare-ui.cjs
node scripts/icons.cjs
cp build/icon.icns "$app/Contents/Resources/icon.icns"
cp dist/assets/tray.png "$app/Contents/Resources/tray.png"
cp macos/Info.plist "$app/Contents/Info.plist"
swiftc -O -whole-module-optimization -target "$arch-apple-macos13.0" macos/PainPig.swift -o "$app/Contents/MacOS/PainPig" -framework Cocoa -framework WebKit -framework ServiceManagement
strip -x "$app/Contents/MacOS/PainPig"
"$app/Contents/MacOS/PainPig" --self-test
# Retain the existing ad-hoc test signing posture. This is NOT Developer ID signing or notarization.
codesign --force --sign - --timestamp=none "$app"
codesign --verify --deep --strict --verbose=2 "$app"
"$app/Contents/MacOS/PainPig" --smoke-test
stage="build/mac-native/stage"
mkdir -p "$stage"
cp -R "$app" "$stage/PainPig.app"
ln -s /Applications "$stage/Applications"
cp macos/INSTALL.zh-CN.txt "$stage/安装说明.txt"
hdiutil create -quiet -volname "PainPig Lite" -srcfolder "$stage" -ov -format ULFO "build/mac-native/PainPig-Lite-$arch.dmg"

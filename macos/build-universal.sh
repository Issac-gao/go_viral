#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(uname -m)" = x86_64
bash macos/build.sh
app="build/mac-native/PainPig.app"
exe="$app/Contents/MacOS/PainPig"
cp "$exe" build/mac-native/PainPig-x86_64
swiftc -O -whole-module-optimization -target arm64-apple-macos13.0 macos/PainPig.swift -o build/mac-native/PainPig-arm64 -framework Cocoa -framework WebKit -framework ServiceManagement
strip -x build/mac-native/PainPig-arm64
lipo -create build/mac-native/PainPig-x86_64 build/mac-native/PainPig-arm64 -output "$exe"
lipo -verify_arch x86_64 arm64 "$exe"
codesign --force --sign - --timestamp=none "$app"
codesign --verify --deep --strict --all-architectures --verbose=2 "$app"
"$exe" --self-test
"$exe" --smoke-test
stage="build/mac-native/universal-stage"
mkdir -p "$stage"
cp -R "$app" "$stage/PainPig.app"
ln -s /Applications "$stage/Applications"
cp macos/INSTALL.zh-CN.txt "$stage/安装说明.txt"
hdiutil create -quiet -volname "PainPig Lite Universal" -srcfolder "$stage" -ov -format ULFO build/mac-native/PainPig-Lite-universal.dmg

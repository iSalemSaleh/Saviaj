#!/bin/bash

# AtlasRide Android Build Script
# Usage: ./script/cap-build.sh [debug|release]

set -e

BUILD_TYPE=${1:-debug}

echo "Building AtlasRide for Android ($BUILD_TYPE)..."

# Step 1: Build the web app
echo "Step 1: Building web assets..."
npm run build

# Step 2: Sync with Android
echo "Step 2: Syncing with Android project..."
npx cap sync android

# Step 3: Build Android APK
echo "Step 3: Building Android APK..."
cd android

if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease
    echo ""
    echo "Release APK built successfully!"
    echo "Location: android/app/build/outputs/apk/release/app-release-unsigned.apk"
else
    ./gradlew assembleDebug
    echo ""
    echo "Debug APK built successfully!"
    echo "Location: android/app/build/outputs/apk/debug/app-debug.apk"
fi

echo ""
echo "Build complete!"

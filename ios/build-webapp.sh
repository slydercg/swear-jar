#!/bin/bash
# Build script: Copies web app files into the iOS bundle's WebApp directory.
# Run this before building in Xcode, or add it as a Build Phase script.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$SCRIPT_DIR/SwearJar/SwearJar/WebApp"

echo "Copying web app files to iOS bundle..."

# Clean destination
rm -rf "$DEST"
mkdir -p "$DEST/css" "$DEST/js"

# Copy web app files
cp "$REPO_ROOT/index.html" "$DEST/"
cp "$REPO_ROOT/css/styles.css" "$DEST/css/"
cp "$REPO_ROOT/js/app.js" "$DEST/js/"
cp "$REPO_ROOT/js/core.js" "$DEST/js/"
cp "$REPO_ROOT/manifest.json" "$DEST/"

# Copy icons if they exist
cp "$REPO_ROOT/icon-192.png" "$DEST/" 2>/dev/null || true
cp "$REPO_ROOT/icon-512.png" "$DEST/" 2>/dev/null || true

echo "Done! Web app files copied to: $DEST"
echo "Files:"
find "$DEST" -type f | sort

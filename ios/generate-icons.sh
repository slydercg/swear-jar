#!/bin/bash
# Generate App Store icons from a 1024x1024 source image.
# Usage: ./generate-icons.sh source-icon.png
# Requires: sips (macOS built-in) or ImageMagick

set -e

SOURCE="${1:-../../icon-512.png}"
OUT_DIR="SwearJar/SwearJar/Assets.xcassets/AppIcon.appiconset"

if [ ! -f "$SOURCE" ]; then
  echo "Source icon not found: $SOURCE"
  echo "Usage: ./generate-icons.sh path/to/1024x1024-icon.png"
  exit 1
fi

mkdir -p "$OUT_DIR"

# Required iOS icon sizes
SIZES="1024 180 167 152 120 87 80 76 60 58 40 29 20"

for SIZE in $SIZES; do
  if command -v sips &>/dev/null; then
    sips -z $SIZE $SIZE "$SOURCE" --out "$OUT_DIR/icon-${SIZE}.png" &>/dev/null
  elif command -v convert &>/dev/null; then
    convert "$SOURCE" -resize ${SIZE}x${SIZE} "$OUT_DIR/icon-${SIZE}.png"
  else
    echo "Need sips (macOS) or ImageMagick (convert) to resize icons"
    exit 1
  fi
  echo "Generated: icon-${SIZE}.png"
done

# Update Contents.json
cat > "$OUT_DIR/Contents.json" << 'ICONS_EOF'
{
  "images": [
    { "filename": "icon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024" },
    { "filename": "icon-180.png", "idiom": "iphone", "scale": "3x", "size": "60x60" },
    { "filename": "icon-120.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
    { "filename": "icon-167.png", "idiom": "ipad", "scale": "2x", "size": "83.5x83.5" },
    { "filename": "icon-152.png", "idiom": "ipad", "scale": "2x", "size": "76x76" },
    { "filename": "icon-76.png", "idiom": "ipad", "scale": "1x", "size": "76x76" },
    { "filename": "icon-87.png", "idiom": "iphone", "scale": "3x", "size": "29x29" },
    { "filename": "icon-58.png", "idiom": "iphone", "scale": "2x", "size": "29x29" },
    { "filename": "icon-80.png", "idiom": "iphone", "scale": "2x", "size": "40x40" },
    { "filename": "icon-40.png", "idiom": "iphone", "scale": "1x", "size": "40x40" },
    { "filename": "icon-60.png", "idiom": "iphone", "scale": "3x", "size": "20x20" },
    { "filename": "icon-29.png", "idiom": "iphone", "scale": "1x", "size": "29x29" },
    { "filename": "icon-20.png", "idiom": "iphone", "scale": "1x", "size": "20x20" }
  ],
  "info": { "author": "xcode", "version": 1 }
}
ICONS_EOF

echo "Done! Generated all icon sizes in $OUT_DIR"
echo "Run this script on your Mac with a 1024x1024 PNG icon."

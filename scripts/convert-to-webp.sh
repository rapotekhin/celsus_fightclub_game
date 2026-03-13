#!/bin/bash
# Convert all PNG sprite frames to WebP for faster loading.
# Keeps original PNGs. WebP files are created alongside them.
# Requires: ImageMagick (convert)
#
# Usage: bash scripts/convert-to-webp.sh

QUALITY=85
ASSETS_DIR="$(dirname "$0")/../assets/sprites"
CONVERTED=0
SKIPPED=0
FAILED=0

echo "🖼️  Converting PNG frames to WebP (quality=$QUALITY)..."
echo "   Source: $ASSETS_DIR"
echo ""

# Find all PNG files in sprite directories
while IFS= read -r png_file; do
  webp_file="${png_file%.png}.webp"
  
  # Skip if WebP already exists and is newer than PNG
  if [ -f "$webp_file" ] && [ "$webp_file" -nt "$png_file" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  if convert "$png_file" -quality "$QUALITY" "$webp_file" 2>/dev/null; then
    CONVERTED=$((CONVERTED + 1))
  else
    echo "  ❌ Failed: $png_file"
    FAILED=$((FAILED + 1))
  fi
  
  # Progress every 100 files
  total=$((CONVERTED + SKIPPED + FAILED))
  if [ $((total % 100)) -eq 0 ] && [ $total -gt 0 ]; then
    echo "  ... processed $total files ($CONVERTED converted, $SKIPPED skipped)"
  fi
done < <(find "$ASSETS_DIR" -name "*.png" -type f | sort)

echo ""
echo "✅ Done! Converted: $CONVERTED, Skipped: $SKIPPED, Failed: $FAILED"

# Show size comparison
PNG_SIZE=$(find "$ASSETS_DIR" -name "*.png" -type f -exec du -cb {} + | tail -1 | awk '{print $1}')
WEBP_SIZE=$(find "$ASSETS_DIR" -name "*.webp" -type f -exec du -cb {} + 2>/dev/null | tail -1 | awk '{print $1}')
if [ -n "$WEBP_SIZE" ] && [ "$WEBP_SIZE" -gt 0 ]; then
  echo ""
  echo "📊 Size comparison:"
  echo "   PNG total:  $(echo "$PNG_SIZE" | awk '{printf "%.1f MB", $1/1048576}')"
  echo "   WebP total: $(echo "$WEBP_SIZE" | awk '{printf "%.1f MB", $1/1048576}')"
  echo "   Reduction:  $(echo "$PNG_SIZE $WEBP_SIZE" | awk '{printf "%.1fx smaller", $1/$2}')"
fi

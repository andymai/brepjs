#!/bin/bash
set -e
MAX_FILES=500

PACK_OUTPUT=$(npm pack --dry-run --ignore-scripts 2>&1)
TOTAL_FILES=$(echo "$PACK_OUTPUT" | grep "total files" | awk '{print $NF}')

if [ -z "$TOTAL_FILES" ] || ! [ "$TOTAL_FILES" -eq "$TOTAL_FILES" ] 2>/dev/null; then
  echo "ERROR: Could not parse file count from npm pack output"
  echo "$PACK_OUTPUT"
  exit 1
fi

echo "Package files: $TOTAL_FILES (max: $MAX_FILES)"

if [ "$TOTAL_FILES" -gt "$MAX_FILES" ]; then
  echo "ERROR: Too many files in package ($TOTAL_FILES > $MAX_FILES)"
  echo "Run 'npm pack --dry-run' to inspect"
  exit 1
fi

# Reject .d.ts.map sidecars: they have no consumer value because .ts sources
# are not shipped, and they previously caused publish failures by inflating
# the file count (see vite.config.ts declarationMap setting).
MAP_COUNT=$(echo "$PACK_OUTPUT" | grep -c '\.d\.ts\.map' || true)
if [ "$MAP_COUNT" -gt 0 ]; then
  echo "ERROR: Package contains $MAP_COUNT .d.ts.map files; expected 0"
  echo "Disable declarationMap in the build (see vite.config.ts)"
  exit 1
fi

echo "Package validation passed"

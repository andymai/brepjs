#!/bin/bash
set -e
MAX_FILES=400

PACK_OUTPUT=$(npm pack --dry-run --ignore-scripts 2>&1)
TOTAL_FILES=$(echo "$PACK_OUTPUT" | grep "total files" | grep -oP '\d+')

echo "Package files: $TOTAL_FILES (max: $MAX_FILES)"

if [ "$TOTAL_FILES" -gt "$MAX_FILES" ]; then
  echo "ERROR: Too many files in package ($TOTAL_FILES > $MAX_FILES)"
  echo "Run 'npm pack --dry-run' to inspect"
  exit 1
fi

echo "Package validation passed"

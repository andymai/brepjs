#!/bin/bash
# Validate plugin structure before publishing
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Validating plugin structure..."

# Check required directories
for dir in .claude-plugin commands agents scripts examples; do
  if [ ! -d "$PLUGIN_DIR/$dir" ]; then
    echo "ERROR: Missing required directory: $dir"
    exit 1
  fi
done

# Check plugin.json exists and is valid JSON
if ! jq empty "$PLUGIN_DIR/.claude-plugin/plugin.json" 2>/dev/null; then
  echo "ERROR: Invalid plugin.json"
  exit 1
fi

# Check that .git is not included
if [ -d "$PLUGIN_DIR/.git" ]; then
  echo "ERROR: .git directory should not be included in package"
  echo "Remove it with: rm -rf brepjs-plugin/.git"
  exit 1
fi

echo "Plugin validation passed"

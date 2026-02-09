#!/bin/bash
# Auto-validate brepjs files after generation
# Called by post-Write hook

# Read tool input from stdin (hook provides this)
FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path' 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ]; then
  # No file path, exit silently
  exit 0
fi

# Only process TypeScript files
if [[ ! "$FILE_PATH" =~ \.ts$ ]]; then
  exit 0
fi

# Check if file contains brepjs imports
if ! grep -q "from 'brepjs'" "$FILE_PATH" 2>/dev/null && \
   ! grep -q 'from "brepjs"' "$FILE_PATH" 2>/dev/null; then
  exit 0
fi

echo ""
echo "🔄 Auto-validating brepjs model..."
echo ""

# Get file directory and name
FILE_DIR=$(dirname "$FILE_PATH")
FILE_NAME=$(basename "$FILE_PATH")

# Run the TypeScript file
cd "$FILE_DIR" || exit 0

echo "Executing: $FILE_NAME"
OUTPUT=$(npx tsx "$FILE_NAME" 2>&1)
EXIT_CODE=$?

echo "$OUTPUT"
echo ""

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ Execution failed (exit code $EXIT_CODE)"
  echo ""
  exit 0  # Non-blocking - let user continue
fi

# Find generated STL (most recent .stl file newer than source)
STL_FILE=$(find . -name "*.stl" -type f -newer "$FILE_PATH" 2>/dev/null | head -1)

if [ -z "$STL_FILE" ]; then
  echo "⚠️ No STL output detected (model may not export STL)"
  echo ""
  exit 0
fi

echo "✓ Found output: $STL_FILE"
echo ""

# Run STL analysis (if script exists)
if [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-stl.js" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-stl.js" "$STL_FILE" 2>/dev/null
else
  # Basic file info if analysis script not available
  FILE_SIZE=$(du -h "$STL_FILE" | cut -f1)
  echo "STL file size: $FILE_SIZE"
fi

echo ""
echo "✓ Auto-validation complete"
echo ""

exit 0

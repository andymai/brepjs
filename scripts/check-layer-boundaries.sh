#!/usr/bin/env bash
set -euo pipefail

# Layer boundary enforcement for brepjs
# Ensures imports only flow downward through the layer hierarchy.
#
# Layer 0: kernel/, utils/       — no internal imports
# Layer 1: core/                 — can import kernel/, utils/
# Layer 2: topology/, 2d/, operations/, query/, measurement/, io/
#                                — can import layers 0-1 + each other
# Layer 3: sketching/, text/, projection/
#                                — can import layers 0-2

STAGED_ONLY=false
if [[ "${1:-}" == "--staged" ]]; then
  STAGED_ONLY=true
fi

SRC_DIR="src"
ERRORS=()

# Map directory to layer number
get_layer() {
  local dir="$1"
  case "$dir" in
    kernel|utils) echo 0 ;;
    core) echo 1 ;;
    topology|2d|operations|query|measurement|io|worker) echo 2 ;;
    sketching|text|projection) echo 3 ;;
    *) echo -1 ;;
  esac
}

# Get top-level src directory from a file path
get_src_dir() {
  local filepath="$1"
  # Strip src/ prefix and get first directory component
  local relative="${filepath#src/}"
  echo "${relative%%/*}"
}

# Get the target directory from an import path
resolve_import_dir() {
  local source_file="$1"
  local import_path="$2"

  # Only check relative imports (starting with . or ..)
  if [[ ! "$import_path" =~ ^\. ]]; then
    return
  fi

  # Get the directory of the source file
  local source_dir
  source_dir=$(dirname "$source_file")

  # Resolve the relative import to an absolute-ish path
  local resolved
  resolved=$(cd "$source_dir" 2>/dev/null && realpath -m --relative-to="$SRC_DIR" "$import_path" 2>/dev/null || echo "")

  if [[ -z "$resolved" ]]; then
    # Manual resolution for cases where cd fails
    local combined="$source_dir/$import_path"
    # Normalize path
    resolved=$(python3 -c "import os.path; print(os.path.normpath('$combined'))" 2>/dev/null || echo "")
    resolved="${resolved#src/}"
  fi

  # Get the top-level directory
  echo "${resolved%%/*}"
}

# Collect files to check
if $STAGED_ONLY; then
  FILES=$(git diff --cached --name-only --diff-filter=ACMR -- 'src/**/*.ts' 2>/dev/null || true)
else
  FILES=$(find "$SRC_DIR" -name '*.ts' -type f 2>/dev/null || true)
fi

if [[ -z "$FILES" ]]; then
  echo "No files to check."
  exit 0
fi

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ ! -f "$file" ]] && continue

  src_dir=$(get_src_dir "$file")
  src_layer=$(get_layer "$src_dir")

  # Skip files not in a recognized layer (e.g., index.ts, oclib.ts at src root)
  if [[ "$src_layer" == "-1" ]]; then
    continue
  fi

  # Extract import paths from the file
  while IFS= read -r import_path; do
    [[ -z "$import_path" ]] && continue

    target_dir=$(resolve_import_dir "$file" "$import_path")
    [[ -z "$target_dir" ]] && continue

    target_layer=$(get_layer "$target_dir")
    [[ "$target_layer" == "-1" ]] && continue

    # Check: target layer must be <= source layer
    if (( target_layer > src_layer )); then
      ERRORS+=("VIOLATION: $file (layer $src_layer: $src_dir) imports from '$import_path' (layer $target_layer: $target_dir)")
    fi
  done < <(grep -oP "from ['\"](\K[^'\"]+)" "$file" 2>/dev/null || true)

done <<< "$FILES"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "Layer boundary violations found:"
  echo ""
  for err in "${ERRORS[@]}"; do
    echo "  $err"
  done
  echo ""
  echo "Layer 0: kernel/, utils/"
  echo "Layer 1: core/"
  echo "Layer 2: topology/, 2d/, operations/, query/, measurement/, io/"
  echo "Layer 3: sketching/, text/, projection/"
  echo ""
  echo "Imports must flow downward (higher layer -> lower layer or same layer)."
  exit 1
fi

echo "Layer boundary check passed."

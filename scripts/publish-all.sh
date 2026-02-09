#!/bin/bash
# Publish brepjs packages to npm
# Usage: ./scripts/publish-all.sh [--otp CODE] [--dry-run]
#
# Publishes in order: brepjs-opencascade -> brepjs (respecting peer deps)
# Prompts for OTP if not provided via --otp flag

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DRY_RUN=false
OTP=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --otp)
      OTP="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

get_otp() {
  if [[ -n "$OTP" ]]; then
    echo "$OTP"
  else
    read -p "Enter npm OTP code: " otp_code
    echo "$otp_code"
  fi
}

publish_package() {
  local pkg_dir="$1"
  local pkg_name="$2"

  cd "$pkg_dir"

  local version=$(node -p "require('./package.json').version")
  echo -e "${YELLOW}Publishing ${pkg_name}@${version}...${NC}"

  if $DRY_RUN; then
    echo -e "${GREEN}[DRY-RUN] Would publish ${pkg_name}@${version}${NC}"
    npm pack --dry-run
  else
    local otp_code=$(get_otp)
    npm publish --no-provenance --otp="$otp_code"
    echo -e "${GREEN}Published ${pkg_name}@${version}${NC}"
  fi
}

echo -e "${YELLOW}=== brepjs Package Publisher ===${NC}"
echo ""

# 1. Publish brepjs-opencascade first (it's a peer dep of brepjs)
echo -e "${YELLOW}Step 1: Publishing brepjs-opencascade${NC}"
publish_package "$ROOT_DIR/packages/brepjs-opencascade" "brepjs-opencascade"

echo ""

# 2. Publish brepjs
echo -e "${YELLOW}Step 2: Publishing brepjs${NC}"
publish_package "$ROOT_DIR" "brepjs"

echo ""
echo -e "${GREEN}=== All packages published successfully ===${NC}"

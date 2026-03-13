#!/usr/bin/env bash
set -e

echo "=== brepjs validation ==="

echo -e "\n→ [1/5] Typecheck..."
npm run typecheck

echo -e "\n→ [2/5] Lint..."
npm run lint

echo -e "\n→ [3/5] Boundary check..."
npm run check:boundaries

echo -e "\n→ [4/5] Format check..."
npm run format:check

echo -e "\n→ [5/5] Changed-file tests..."
npm run test

echo -e "\n=== All checks passed ==="

#!/usr/bin/env bash
# check-function-lookup.sh - Remind to regenerate function-lookup.md when Fns files change
# Non-blocking: always exits 0 (reminds but does not fail commit)

STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null) || true
[ -z "$STAGED" ] && exit 0

echo "$STAGED" | grep -qE '^src/.*Fns\.ts$|^src(/[^/]+)?/index\.ts$' || exit 0

if ! echo "$STAGED" | grep -q '^docs/function-lookup\.md$'; then
  printf '\n📋 Function lookup reminder:\n'
  printf '  You changed *Fns.ts or index files but docs/function-lookup.md is not staged.\n'
  printf '  Run: npm run docs:generate-lookup\n'
  printf '  Then stage the updated file if it changed.\n\n'
fi

exit 0

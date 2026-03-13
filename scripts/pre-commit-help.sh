#!/usr/bin/env bash
cat <<EOF

❌ Pre-commit hook failed

Quality gates enforce:
- ✅ ESLint + Prettier (fix: npm run lint:fix && npm run format)
- ✅ TypeScript strict mode (no any, no non-null assertions)
- ✅ Layer boundaries (Layer 0 → 1 → 2 → 3)
- ✅ Changed-file tests (coverage thresholds enforced at push time)

To see detailed errors:
  npm run typecheck          # Type errors
  npm run check:boundaries   # Architecture violations
  npm run test:full          # Full suite with coverage

To bypass (NOT recommended):
  git commit --no-verify -m "emergency fix"

More info: CONTRIBUTING.md#code-coverage-requirements
EOF
exit 1

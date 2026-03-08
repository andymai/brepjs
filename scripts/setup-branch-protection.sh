#!/usr/bin/env bash
set -euo pipefail

# Configure branch protection rules for the main branch.
# Requires: gh CLI authenticated with admin access.
#
# Usage: bash scripts/setup-branch-protection.sh [owner/repo]
# Default: reads from current git remote

REPO="${1:-$(gh repo view --json nameWithOwner -q '.nameWithOwner')}"
BRANCH="main"

echo "Configuring branch protection for $REPO ($BRANCH)..."

gh api --method PUT "repos/$REPO/branches/$BRANCH/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci-pass"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF

cat <<MSG
Branch protection configured for $REPO ($BRANCH):
  - Required status check: ci-pass (strict — branch must be up to date)
  - 1 approving review required, stale reviews dismissed
  - Linear history required (squash/rebase only)
  - Force pushes and branch deletion blocked
  - All conversations must be resolved before merging
MSG

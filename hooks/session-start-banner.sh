#!/usr/bin/env bash
# SessionStart hook: print FoodMax team reminder + lockfile status.
# Non-blocking: never exits non-zero.
set -uo pipefail

if [[ -f ".foodmax-ai.lock.json" ]]; then
  if command -v node >/dev/null 2>&1; then
    VERSION=$(node -p "require('./.foodmax-ai.lock.json').packageVersion || 'unknown'" 2>/dev/null || echo "unknown")
    echo "FoodMax AI config: pinned to v${VERSION}"
  else
    echo "FoodMax AI config: lockfile present (node not available to read version)"
  fi
else
  echo "FoodMax AI config: not yet initialized in this project."
  echo "  → Run: npx -y github:foodmax/ai-config-init init"
fi
exit 0

#!/bin/bash
# Deploy to Vercel from a copy without .git (CLI deploys are then not tied to a commit author).
#   scripts/deploy-vercel.sh          # preview URL
#   scripts/deploy-vercel.sh --prod   # production
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .vercel --exclude .env.local \
  "$ROOT/" "$STAGE/"
cd "$STAGE"
npx -y vercel@64.0.2 link --yes --project gurudeep-qr --scope gurudeepnaiks-projects >/dev/null
npx -y vercel@64.0.2 deploy --yes --scope gurudeepnaiks-projects "$@"

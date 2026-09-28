#!/usr/bin/env bash
# Deploy origin/main to poengkart.no and check that the site serves main's
# schools.json. Used by .github/workflows/live.yml after a merge (its own, or
# the owner's merge of a live pull request) and on a dispatch with deploy.
#
#   tools/live/deploy.sh [pull request url]
#
# Needs VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID in the environment;
# without the token it says so (on the pull request too) and exits 0.
set -euo pipefail
PR="${1:-}"
say() { echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"; }

if [ -z "${VERCEL_TOKEN:-}" ] || [ -z "${VERCEL_PROJECT_ID:-}" ]; then
  msg="Merged to main, not deployed: the VERCEL_TOKEN secret is not set. Deploy by hand (vercel deploy --prod) or set it."
  echo "::warning::$msg"; say "$msg"
  if [ -n "$PR" ]; then gh pr comment "$PR" --body "$msg" || true; fi
  exit 0
fi

git fetch -q origin main && git checkout -q FETCH_HEAD
log="${RUNNER_TEMP:-/tmp}/deploy.log"
npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" | tee "$log"
url=$(tail -1 "$log")

want=$(sha256sum web/public/data/schools.json | cut -d' ' -f1)
got=""
for i in 1 2 3 4 5 6; do
  sleep 10
  got=$({ curl -sfL "https://poengkart.no/data/schools.json?live=${GITHUB_RUN_ID:-$RANDOM}-$i" || true; } | sha256sum | cut -d' ' -f1)
  [ "$want" = "$got" ] && break
done
if [ "$want" = "$got" ]; then
  say "Deployed main $(git rev-parse --short HEAD) ($url); poengkart.no serves its schools.json."
  if [ -n "$PR" ]; then gh pr comment "$PR" --body "Deployed to https://poengkart.no ($url); the site serves this schools.json."; fi
else
  echo "::error::deployed $url, but poengkart.no does not serve main's schools.json after a minute"
  if [ -n "$PR" ]; then gh pr comment "$PR" --body "Deployed ($url), but poengkart.no did not serve this schools.json within a minute; check the domain aliases."; fi
  exit 1
fi

#!/usr/bin/env bash
# Deploy spif.amsterdam to Cloudflare Pages using the PERSONAL Cloudflare account.
#
# Why this script exists: wrangler's OAuth login is global and machine-wide, and
# on this machine it is signed in to the Setso work account (Setflow BV) for the
# other repos. spif.amsterdam lives under the personal account, so deploying with
# the OAuth session fails with `Authentication error [code: 10000]`.
#
# Wrangler checks CLOUDFLARE_API_TOKEN before its OAuth session, so exporting a
# personal-account token here overrides the login for this command only. The Setso
# OAuth session is left completely untouched.
#
# Setup (once):
#   1. Sign in to Cloudflare as stefan.j.fountain@gmail.com
#   2. https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom token
#        Account → Cloudflare Pages → Edit
#        Zone    → Cache Purge → Purge      (optional, enables --purge below)
#        Account resources: include the personal account
#   3. Save it outside this repo — the repo is public on GitHub:
#        mkdir -p ~/.local/share/cloudflare
#        cat > ~/.local/share/cloudflare/spif-personal.env <<'ENV'
#        CLOUDFLARE_API_TOKEN=paste_token_here
#        CLOUDFLARE_ACCOUNT_ID=994ef655c3171d9ef38e6951f20e978b
#        ENV
#        chmod 600 ~/.local/share/cloudflare/spif-personal.env
#
# Usage:
#   ./deploy.sh            deploy
#   ./deploy.sh --purge    deploy, then purge the Cloudflare cache

set -euo pipefail

ENV_FILE="${CLOUDFLARE_ENV_FILE:-$HOME/.local/share/cloudflare/spif-personal.env}"
PROJECT="spif-amsterdam"
ZONE_ID="ea57ce46cef5a018a068fc904e0c39d5"
cd "$(dirname "$0")"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
✘ No credentials at $ENV_FILE

  spif.amsterdam deploys under the PERSONAL Cloudflare account, but wrangler on
  this machine is logged in as the Setso work account. Create a personal-account
  API token and save it to that path — see the setup notes at the top of this
  script. Do not put the token in this repo; it is public on GitHub.
EOF
  exit 1
fi

set -a; . "$ENV_FILE"; set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "✘ CLOUDFLARE_API_TOKEN is not set in $ENV_FILE" >&2
  exit 1
fi

# Don't let a stale OAuth session win.
unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL 2>/dev/null || true

echo "→ Deploying $PROJECT with the personal-account API token"
wrangler pages deploy . --project-name="$PROJECT" --branch=main --commit-dirty=true

if [[ "${1:-}" == "--purge" ]]; then
  echo "→ Purging cache for zone $ZONE_ID"
  curl -fsS -X POST \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' >/dev/null \
    && echo "  cache purged" \
    || echo "  ✘ purge failed — the token probably lacks Zone → Cache Purge"
fi

echo "→ Verifying"
# Retry: straight after a cache purge the edge can take a few seconds to serve
# the new deploy, and a single impatient probe reports a false failure.
ok=0
for attempt in 1 2 3 4 5 6; do
  sleep 4
  probe="https://spif.amsterdam/vox-arboris/?probe=$(date +%s)-$attempt"
  if curl -fsSL "$probe" | grep -q "Vox Arboris"; then ok=1; break; fi
  echo "  attempt $attempt: not yet…"
done
if [[ $ok == 1 ]]; then
  echo "✓ live — https://spif.amsterdam/vox-arboris"
else
  echo "✘ deployed but the page did not verify after ~24s; check https://spif.amsterdam/vox-arboris manually"
fi

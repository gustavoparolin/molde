#!/usr/bin/env bash
# Provision infra for a Molde app (bash twin of provision.ps1). DRY-RUN by default; -x to execute.
#   ./scripts/provision.sh [slug] [-r] [-x]    (-r = create R2 bucket, -x = execute)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
slug="${1:-$(basename "$root")}"; [[ "$slug" == -* ]] && slug="$(basename "$root")"
r2=0; dry=1
for a in "$@"; do [ "$a" = "-r" ] && r2=1; [ "$a" = "-x" ] && dry=0; done

env_file="$HOME/.config/molde/provision.env"
[ -f "$env_file" ] || { echo "Missing $env_file (see README)." >&2; exit 1; }
set -a; . "$env_file"; set +a

app="$slug.parolin.net"; api="api-$slug.parolin.net"
cf="https://api.cloudflare.com/client/v4"
echo "=== Provision '$slug' ($([ $dry -eq 1 ] && echo DRY-RUN || echo EXECUTE)) ==="

call() { # label method url json
  echo "→ $1"; echo "  $2 $3"; [ -n "${4:-}" ] && echo "  body: $4"
  [ $dry -eq 1 ] && return 0
  case "$3" in
    *api.cloudflare*) auth="Bearer $CLOUDFLARE_API_TOKEN" ;;
    *) auth="Bearer $COOLIFY_TOKEN" ;;
  esac
  curl -fsS -X "$2" "$3" -H "Authorization: $auth" -H "Content-Type: application/json" ${4:+-d "$4"}
}

call "CF DNS api-$slug" POST "$cf/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
  "{\"type\":\"CNAME\",\"name\":\"$api\",\"content\":\"$COOLIFY_HOST\",\"proxied\":true}"
call "CF Pages project" POST "$cf/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
  "{\"name\":\"$slug\",\"production_branch\":\"main\"}"
call "CF Pages domain $app" POST "$cf/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$slug/domains" \
  "{\"name\":\"$app\"}"
[ $r2 -eq 1 ] && call "CF R2 bucket" POST "$cf/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets" \
  "{\"name\":\"$slug-assets\"}"

call "Coolify Postgres" POST "$COOLIFY_API_URL/databases/postgresql" \
  "{\"server_uuid\":\"$COOLIFY_SERVER_UUID\",\"project_uuid\":\"$COOLIFY_PROJECT_UUID\",\"environment_name\":\"production\",\"name\":\"$slug\"}"
call "Coolify App" POST "$COOLIFY_API_URL/applications/private-github-app" \
  "{\"server_uuid\":\"$COOLIFY_SERVER_UUID\",\"project_uuid\":\"$COOLIFY_PROJECT_UUID\",\"environment_name\":\"production\",\"github_app_uuid\":\"$COOLIFY_GITHUB_APP_UUID\",\"git_repository\":\"gustavoparolin/$slug\",\"git_branch\":\"main\",\"build_pack\":\"nixpacks\",\"base_directory\":\"/backend\",\"domains\":\"https://$api\"}"

echo ""
echo "Set Coolify envs (PORT, DATABASE_URL, FRONTEND_ORIGINS=https://$app, JWT_SECRET, GOOGLE_*, NIXPACKS_NODE_VERSION=22) then deploy."
echo "Residual manual (~30s): add https://$api/auth/google/callback to the shared Google OAuth client."
[ $dry -eq 1 ] && echo "Re-run with -x to apply."

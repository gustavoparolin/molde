#!/usr/bin/env bash
# Tear down infra for a slug (bash twin of deprovision.ps1). DRY-RUN by default; -x to execute.
#   ./scripts/deprovision.sh <slug> [-x]
set -euo pipefail
slug="${1:?usage: deprovision.sh <slug> [-x]}"
dry=1; for a in "$@"; do [ "$a" = "-x" ] && dry=0; done

env_file="$HOME/.config/molde/provision.env"
[ -f "$env_file" ] || { echo "Missing $env_file." >&2; exit 1; }
set -a; . "$env_file"; set +a
cf="https://api.cloudflare.com/client/v4"; acc="$CLOUDFLARE_ACCOUNT_ID"

echo "=== Deprovision '$slug' ($([ $dry -eq 1 ] && echo DRY-RUN || echo EXECUTE)) ==="
echo "WARNING: deletes Pages project, R2 bucket and DNS for '$slug'."

del() { echo "→ DELETE $1"; echo "  $2"; [ $dry -eq 1 ] && return 0
  curl -fsS -X DELETE "$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" || echo "  (skipped)"; }

del "Pages project" "$cf/accounts/$acc/pages/projects/$slug"
del "R2 bucket"     "$cf/accounts/$acc/r2/buckets/$slug-assets"
if [ $dry -eq 0 ]; then
  ids=$(curl -fsS "$cf/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=api-$slug.parolin.net" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "${ids:-}" ] && del "DNS api-$slug" "$cf/zones/$CLOUDFLARE_ZONE_ID/dns_records/$ids"
fi
echo "Coolify app/database: delete via DELETE $COOLIFY_API_URL/applications/<uuid> and /databases/<uuid> after confirming UUIDs."

#!/usr/bin/env pwsh
# Provision infra for a Molde app: Cloudflare (DNS + Pages + optional R2) and Coolify
# (Postgres + Application + env + deploy). Reads secrets from ~/.config/molde/provision.env.
#
# DRY-RUN by default — prints every intended API call (secrets redacted). Pass -Execute to run.
# Always dry-run once before -Execute (see molde-brain.md).
[CmdletBinding()]
param(
  [string]$Slug,
  [switch]$EnableR2,
  [switch]$Execute
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not $Slug) { $Slug = (Split-Path -Leaf $root) }
$dry = -not $Execute

# ── Load ~/.config/molde/provision.env ───────────────────────────────────────
$envFile = Join-Path $HOME ".config/molde/provision.env"
if (-not (Test-Path $envFile)) { throw "Missing $envFile (see README 'Setup único de credenciais')." }
$cfg = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2; $cfg[$k.Trim()] = $v.Trim()
}
function Req($name) { if (-not $cfg[$name]) { throw "provision.env missing $name" }; $cfg[$name] }

$cfToken   = Req "CLOUDFLARE_API_TOKEN"
$cfAccount = Req "CLOUDFLARE_ACCOUNT_ID"
$cfZone    = Req "CLOUDFLARE_ZONE_ID"          # zone id of parolin.net
$cfTarget  = Req "COOLIFY_HOST"                # host/IP that api-<slug> should point at
$coolUrl   = Req "COOLIFY_API_URL"
$coolToken = Req "COOLIFY_TOKEN"
$coolSrv   = Req "COOLIFY_SERVER_UUID"
$coolProj  = Req "COOLIFY_PROJECT_UUID"
$coolGhApp = Req "COOLIFY_GITHUB_APP_UUID"
$googleId  = Req "GOOGLE_CLIENT_ID"
$googleSec = Req "GOOGLE_CLIENT_SECRET"

$appHost = "$Slug.parolin.net"
$apiHost = "api-$Slug.parolin.net"
Write-Host ("=== Provision '{0}'  ({1}) ===" -f $Slug, ($(if ($dry) {"DRY-RUN"} else {"EXECUTE"}))) -ForegroundColor Cyan

function Call($label, $method, $url, $headers, $body) {
  Write-Host "→ $label" -ForegroundColor Yellow
  Write-Host "  $method $url" -ForegroundColor DarkGray
  if ($body) { Write-Host ("  body: " + ($body | ConvertTo-Json -Compress -Depth 8)) -ForegroundColor DarkGray }
  if ($dry) { return $null }
  $json = if ($body) { $body | ConvertTo-Json -Depth 8 } else { $null }
  return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -Body $json -ContentType "application/json"
}

$cfHdr   = @{ Authorization = "Bearer $cfToken" }
$coolHdr = @{ Authorization = "Bearer $coolToken" }

# ── 1) Cloudflare DNS: api-<slug> → Coolify host ─────────────────────────────
Call "Cloudflare DNS (api-$Slug)" "POST" "https://api.cloudflare.com/client/v4/zones/$cfZone/dns_records" $cfHdr `
  @{ type = "CNAME"; name = $apiHost; content = $cfTarget; proxied = $true }

# ── 2) Cloudflare Pages project + custom domain (auto-creates app DNS) ────────
Call "Cloudflare Pages project ($Slug)" "POST" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/pages/projects" $cfHdr `
  @{ name = $Slug; production_branch = "main" }
Call "Cloudflare Pages domain ($appHost)" "POST" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/pages/projects/$Slug/domains" $cfHdr `
  @{ name = $appHost }

# ── 3) Optional R2 bucket ────────────────────────────────────────────────────
if ($EnableR2) {
  Call "Cloudflare R2 bucket ($Slug-assets)" "POST" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/r2/buckets" $cfHdr `
    @{ name = "$Slug-assets" }
}

# ── 4) Coolify Postgres ──────────────────────────────────────────────────────
$pg = Call "Coolify Postgres ($Slug)" "POST" "$coolUrl/databases/postgresql" $coolHdr `
  @{ server_uuid = $coolSrv; project_uuid = $coolProj; environment_name = "production"; name = $Slug }
$databaseUrl = if ($dry) { "<connection-string-from-coolify>" } else { $pg.internal_db_url }

# ── 5) Coolify Application (GitHub App source, base dir /backend) ─────────────
$app = Call "Coolify Application ($apiHost)" "POST" "$coolUrl/applications/private-github-app" $coolHdr `
  @{
    server_uuid          = $coolSrv
    project_uuid         = $coolProj
    environment_name     = "production"
    github_app_uuid      = $coolGhApp
    git_repository       = "gustavoparolin/$Slug"
    git_branch           = "main"
    build_pack           = "nixpacks"
    base_directory       = "/backend"
    domains              = "https://$apiHost"
    instant_deploy       = $false
  }
$appUuid = if ($dry) { "<app-uuid>" } else { $app.uuid }

# ── 6) Coolify env vars ──────────────────────────────────────────────────────
$envs = @{
  PORT                  = "3000"
  DATABASE_URL          = $databaseUrl
  FRONTEND_ORIGINS      = "https://$appHost"
  JWT_SECRET            = (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").Trim()
  GOOGLE_CLIENT_ID      = $googleId
  GOOGLE_CLIENT_SECRET  = $googleSec
  GOOGLE_REDIRECT_URI   = "https://$apiHost/auth/google/callback"
  NIXPACKS_NODE_VERSION = "22"
}
foreach ($k in $envs.Keys) {
  Call "Coolify env $k" "POST" "$coolUrl/applications/$appUuid/envs" $coolHdr `
    @{ key = $k; value = $envs[$k]; is_preview = $false }
}

# ── 7) Deploy ────────────────────────────────────────────────────────────────
Call "Coolify deploy" "GET" "$coolUrl/deploy?uuid=$appUuid" $coolHdr $null

Write-Host "`n=== Done ($(if ($dry) {'dry-run'} else {'executed'})) ===" -ForegroundColor Green
Write-Host "Residual manual (~30s): add https://$apiHost/auth/google/callback to the shared Google OAuth client." -ForegroundColor Magenta
if ($dry) { Write-Host "Re-run with -Execute to apply." -ForegroundColor Magenta }

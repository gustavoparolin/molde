#!/usr/bin/env pwsh
# Provision infra for a Molde app: Cloudflare (DNS + Pages + optional R2) and Coolify
# (Postgres + Application + env + deploy). Reads secrets from ~/.config/molde/provision.env.
#
# DRY-RUN by default — prints every intended API call. Pass -Execute to run for real.
# Always dry-run once before -Execute (see molde-brain.md).
[CmdletBinding()]
param(
  [string]$Slug,
  [switch]$EnableR2,
  [switch]$EnableAI,
  # Comma-separated emails allowed to log in (sets ALLOWED_EMAILS — see googleAuth.ts /
  # molde-brain.md §Auth flow). Pass this for personal/family apps; omit for public apps.
  [string]$AllowedEmails,
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

$cfToken     = Req "CLOUDFLARE_API_TOKEN"
$cfAccount   = Req "CLOUDFLARE_ACCOUNT_ID"
$cfZone      = Req "CLOUDFLARE_ZONE_ID"           # zone id of your domain
$cfTarget    = Req "COOLIFY_HOST"                  # host/IP of Coolify VPS
$coolUrl     = Req "COOLIFY_API_URL"
$coolToken   = Req "COOLIFY_TOKEN"
$cfAccessId  = Req "CF_ACCESS_CLIENT_ID"
$cfAccessSec = Req "CF_ACCESS_CLIENT_SECRET"
$coolSrv     = Req "COOLIFY_SERVER_UUID"
$coolProj    = Req "COOLIFY_PROJECT_UUID"
$googleId    = Req "GOOGLE_CLIENT_ID"
$googleSec   = Req "GOOGLE_CLIENT_SECRET"
$githubUser  = if ($cfg["GITHUB_USER"]) { $cfg["GITHUB_USER"] } else { (gh api user --jq .login).Trim() }

$r2Key    = if ($EnableR2) { Req "R2_ACCESS_KEY_ID" } else { $null }
$r2Secret = if ($EnableR2) { Req "R2_SECRET_ACCESS_KEY" } else { $null }

$appHost = "$Slug.parolin.net"
$apiHost = "$Slug-api.parolin.net"

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
$coolHdr = @{
  Authorization            = "Bearer $coolToken"
  "CF-Access-Client-Id"     = $cfAccessId
  "CF-Access-Client-Secret" = $cfAccessSec
}

# ── 1) Cloudflare DNS: api-<slug> → Coolify host ─────────────────────────────
# Use A record when target is an IP, CNAME otherwise
$dnsType = if ($cfTarget -match '^\d{1,3}(\.\d{1,3}){3}$') { "A" } else { "CNAME" }
Call "Cloudflare DNS ($dnsType $apiHost)" "POST" "https://api.cloudflare.com/client/v4/zones/$cfZone/dns_records" $cfHdr `
  @{ type = $dnsType; name = $apiHost; content = $cfTarget; proxied = $true }

# ── 2) Cloudflare Pages project + DNS CNAME + custom domain ─────────────────
$pagesProj = Call "Cloudflare Pages project ($Slug)" "POST" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/pages/projects" $cfHdr `
  @{ name = $Slug; production_branch = "main" }
# CF may assign a suffix (e.g. myapp-2k8.pages.dev) if <slug>.pages.dev is taken by another user.
# Using that suffix as CNAME target avoids error 1014 "CNAME Cross-User Banned".
$pagesSubdomain = if ($dry) { "$Slug.pages.dev" } else { $pagesProj.result.subdomain }
# CNAME must exist before Pages can verify the custom domain
Call "Cloudflare DNS CNAME ($appHost)" "POST" "https://api.cloudflare.com/client/v4/zones/$cfZone/dns_records" $cfHdr `
  @{ type = "CNAME"; name = $appHost; content = $pagesSubdomain; proxied = $true }
Call "Cloudflare Pages domain ($appHost)" "POST" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/pages/projects/$Slug/domains" $cfHdr `
  @{ name = $appHost }

# ── 3) Optional R2 bucket ────────────────────────────────────────────────────
if ($EnableR2) {
  Call "Cloudflare R2 bucket ($Slug-assets)" "POST" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/r2/buckets" $cfHdr `
    @{ name = "$Slug-assets" }
}

# ── 4) Coolify Postgres ──────────────────────────────────────────────────────
# Naming convention: name(label)=$Slug-db  postgres_db/postgres_user=underscore
# (Coolify's validation rejects hyphens in postgres_db/postgres_user — "field
# format is invalid" — even though the display "name" accepts them freely.)
$dbNameLabel = "$Slug-db"
$dbNameId    = "${Slug}_db" -replace '-', '_'
$dbUserId    = "${Slug}_user" -replace '-', '_'
$dbPass      = (node -e "console.log(require('crypto').randomBytes(24).toString('hex'))").Trim()
$pg = Call "Coolify Postgres ($dbNameLabel)" "POST" "$coolUrl/api/v1/databases/postgresql" $coolHdr `
  @{ server_uuid = $coolSrv; project_uuid = $coolProj; environment_name = "production"; name = $dbNameLabel;
     postgres_db = $dbNameId; postgres_user = $dbUserId; postgres_password = $dbPass }
$dbUuid = if ($dry) { "<db-uuid>" } else { $pg.uuid }
$databaseUrl = if ($dry) { "<connection-string-from-coolify>" } else { $pg.internal_db_url }

# Creating the Postgres resource does NOT start its container — it stays
# "exited" until explicitly started, and the app deploy will fail with Prisma
# P1001 ("Can't reach database server") if it races ahead of this. Start it
# and wait for the container to actually report healthy before continuing.
Call "Coolify Postgres start ($dbNameLabel)" "GET" "$coolUrl/api/v1/databases/$dbUuid/start" $coolHdr $null | Out-Null
if (-not $dry) {
  Write-Host "  waiting for Postgres to become healthy..." -ForegroundColor DarkGray
  $healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    try {
      $status = (Invoke-RestMethod -Method GET -Uri "$coolUrl/api/v1/databases/$dbUuid" -Headers $coolHdr).status
      if ($status -match "running") { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { throw "Postgres did not become healthy within 150s — check Coolify dashboard." }
  Write-Host "  Postgres healthy." -ForegroundColor Green
}

# ── 5) Coolify Application (deploy key — fully autonomous, no GitHub App grants) ─
# Generate SSH deploy key → add public key to GitHub repo → add private key to Coolify
$keyFile = Join-Path $env:TEMP "$Slug-deploy"
$keyUuid = $null
if (-not $dry) {
  ssh-keygen -t ed25519 -C "coolify-deploy-$Slug" -f $keyFile -N '' -q
  $pubKey  = Get-Content "$keyFile.pub"
  $privKey = Get-Content $keyFile -Raw
  gh api repos/$githubUser/$Slug/keys --method POST -f title="coolify-deploy" -f key=$pubKey -f read_only=true | Out-Null
  $keyBody = @{ name = "deploy-$Slug"; private_key = $privKey } | ConvertTo-Json
  $keyResp = Invoke-RestMethod -Method POST -Uri "$coolUrl/api/v1/security/keys" -Headers $coolHdr -Body $keyBody -ContentType "application/json"
  $keyUuid = $keyResp.uuid
  Remove-Item $keyFile, "$keyFile.pub" -ErrorAction SilentlyContinue
}

$app = Call "Coolify Application ($apiHost)" "POST" "$coolUrl/api/v1/applications/private-deploy-key" $coolHdr `
  @{
    server_uuid          = $coolSrv
    project_uuid         = $coolProj
    environment_name     = "production"
    private_key_uuid     = if ($dry) { "<key-uuid>" } else { $keyUuid }
    git_repository       = "git@github.com:$githubUser/$Slug.git"
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
if ($EnableR2) {
  $envs["S3_ENDPOINT"]         = "https://$cfAccount.r2.cloudflarestorage.com"
  $envs["S3_BUCKET"]           = "$Slug-assets"
  $envs["S3_ACCESS_KEY"]       = $r2Key
  $envs["S3_SECRET_KEY"]       = $r2Secret
  $envs["S3_REGION"]           = "auto"
  $envs["S3_FORCE_PATH_STYLE"] = "true"
}
if ($EnableAI -or $cfg["AI_API_KEY"]) {
  $envs["AI_API_KEY"]  = Req "AI_API_KEY"
  $envs["AI_BASE_URL"] = if ($cfg["AI_BASE_URL"]) { $cfg["AI_BASE_URL"] } else { "https://open.bigmodel.cn/api/paas/v4" }
  $envs["AI_MODEL"]    = if ($cfg["AI_MODEL"]) { $cfg["AI_MODEL"] } else { "glm-4v-flash" }
}
if ($AllowedEmails) {
  # App-specific access control — NOT a shared infra credential, so it never lives in
  # provision.env. Set it here, BEFORE the first deploy, so the app is never open to any
  # Google account even momentarily (see molde-brain.md §Auth flow for why this matters).
  $envs["ALLOWED_EMAILS"] = $AllowedEmails
}
foreach ($k in $envs.Keys) {
  Call "Coolify env $k" "POST" "$coolUrl/api/v1/applications/$appUuid/envs" $coolHdr `
    @{ key = $k; value = $envs[$k]; is_preview = $false }
}

# ── 7) App build config — port + Node 22 workaround for Prisma 7 ─────────────
# nixpkgs pinned by nixpacks 1.41 ships Node 22.11.0; Prisma 7 needs 22.12+.
# --experimental-require-module unlocks require(esm) on 22.11.0 as a bridge.
if (-not $dry) {
  $patch = @{
    ports_exposes        = "3000"
    health_check_enabled = $true
    health_check_path    = "/health"
    health_check_port    = "3000"
    install_command      = "npm install --ignore-scripts && node --experimental-require-module ./node_modules/.bin/prisma generate"
    start_command        = "node --experimental-require-module ./node_modules/.bin/prisma migrate deploy && node --import=tsx src/api/server.ts"
  } | ConvertTo-Json -Depth 3
  Invoke-RestMethod -Method PATCH -Uri "$coolUrl/api/v1/applications/$appUuid" -Headers $coolHdr -Body $patch -ContentType "application/json" | Out-Null
  Write-Host "→ App build config patched (port + install/start overrides)" -ForegroundColor Yellow
}

# ── 8) GitHub secrets for backend auto-deploy (deploy-backend.yml) ───────────
# These let the CI workflow trigger Coolify redeployments autonomously on push.
if (-not $dry) {
  gh secret set COOLIFY_APP_UUID       --body $appUuid          --repo "$githubUser/$Slug" | Out-Null
  gh secret set COOLIFY_API_TOKEN      --body $coolToken        --repo "$githubUser/$Slug" | Out-Null
  gh secret set COOLIFY_API_URL        --body $coolUrl          --repo "$githubUser/$Slug" | Out-Null
  gh secret set CF_ACCESS_CLIENT_ID    --body $cfAccessId       --repo "$githubUser/$Slug" | Out-Null
  gh secret set CF_ACCESS_CLIENT_SECRET --body $cfAccessSec     --repo "$githubUser/$Slug" | Out-Null
  Write-Host "→ GitHub secrets set for backend auto-deploy" -ForegroundColor Yellow
} else {
  Write-Host "→ [dry] Would set COOLIFY_APP_UUID, COOLIFY_API_TOKEN, COOLIFY_API_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET on $githubUser/$Slug" -ForegroundColor DarkGray
}

# ── 9) Initial deploy ─────────────────────────────────────────────────────────
Call "Coolify deploy" "GET" "$coolUrl/api/v1/deploy?uuid=$appUuid&force=true" $coolHdr $null

Write-Host "`n=== Done ($(if ($dry) {'dry-run'} else {'executed'})) ===" -ForegroundColor Green
Write-Host "Manual step (~30s): add https://$apiHost/auth/google/callback to the shared Google OAuth client." -ForegroundColor Magenta
if ($dry) { Write-Host "Re-run with -Execute to apply." -ForegroundColor Magenta }

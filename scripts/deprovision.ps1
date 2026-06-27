#!/usr/bin/env pwsh
# Tear down the infra created by provision.ps1 for a given slug (use for the guinea-pig app
# or to redo a botched provision). DRY-RUN by default; pass -Execute to actually delete.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [switch]$Execute
)
$ErrorActionPreference = "Stop"
$dry = -not $Execute

$envFile = Join-Path $HOME ".config/molde/provision.env"
if (-not (Test-Path $envFile)) { throw "Missing $envFile." }
$cfg = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2; $cfg[$k.Trim()] = $v.Trim()
}

$cfHdr   = @{ Authorization = "Bearer $($cfg['CLOUDFLARE_API_TOKEN'])" }
$coolHdr = @{ Authorization = "Bearer $($cfg['COOLIFY_TOKEN'])" }
$cfAccount = $cfg["CLOUDFLARE_ACCOUNT_ID"]; $coolUrl = $cfg["COOLIFY_API_URL"]

Write-Host ("=== Deprovision '{0}'  ({1}) ===" -f $Slug, ($(if ($dry) {"DRY-RUN"} else {"EXECUTE"}))) -ForegroundColor Cyan
Write-Host "WARNING: this deletes the Pages project, R2 bucket, Coolify app and database for '$Slug'." -ForegroundColor Red

function Del($label, $url, $headers) {
  Write-Host "→ DELETE $label" -ForegroundColor Yellow
  Write-Host "  $url" -ForegroundColor DarkGray
  if ($dry) { return }
  try { Invoke-RestMethod -Method DELETE -Uri $url -Headers $headers | Out-Null }
  catch { Write-Host "  (skipped: $($_.Exception.Message))" -ForegroundColor DarkYellow }
}

# Cloudflare Pages project (and its custom domain) + R2 bucket
Del "Pages project" "https://api.cloudflare.com/client/v4/accounts/$cfAccount/pages/projects/$Slug" $cfHdr
Del "R2 bucket"     "https://api.cloudflare.com/client/v4/accounts/$cfAccount/r2/buckets/$Slug-assets" $cfHdr

# DNS api-<slug>: look up the record id then delete (dry-run prints the lookup only)
if (-not $dry) {
  $zone = $cfg["CLOUDFLARE_ZONE_ID"]
  $rec = Invoke-RestMethod -Headers $cfHdr `
    -Uri "https://api.cloudflare.com/client/v4/zones/$zone/dns_records?name=api-$Slug.parolin.net"
  foreach ($r in $rec.result) {
    Del "DNS api-$Slug ($($r.id))" "https://api.cloudflare.com/client/v4/zones/$zone/dns_records/$($r.id)" $cfHdr
  }
} else {
  Write-Host "→ (would look up + delete DNS record api-$Slug.parolin.net)" -ForegroundColor Yellow
}

Write-Host "`nCoolify app/database deletion: confirm the UUIDs in the Coolify UI, then delete via:" -ForegroundColor Magenta
Write-Host "  DELETE $coolUrl/applications/<uuid>   and   DELETE $coolUrl/databases/<uuid>" -ForegroundColor DarkGray
Write-Host "(left manual on purpose — deleting the wrong UUID is destructive.)" -ForegroundColor Magenta

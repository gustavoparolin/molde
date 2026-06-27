#!/usr/bin/env pwsh
# Personalize a fresh Molde copy into a new app.
#  - infers the slug from the folder name (override with -Slug)
#  - replaces the `molde-app` slug + "Molde App" display name across the skeleton
#  - resets git to a clean history (the new app gets its own repo)
#  - adds `.brief/` to .gitignore so private planning notes never reach the app repo
#  - generates a JWT_SECRET and writes a local .env
#  - seeds .brief/stack.md from ~/.config/molde/stack.md when present
[CmdletBinding()]
param(
  [string]$Slug,
  [string]$DisplayName,
  [switch]$KeepGit
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot   # repo root (scripts/ lives under root)
Set-Location $root

if (-not $Slug) { $Slug = (Split-Path -Leaf $root) }
$Slug = $Slug.ToLower() -replace "[^a-z0-9-]", "-" -replace "-{2,}", "-" -replace "^-|-$", ""
if (-not $Slug) { throw "Could not derive a valid slug. Pass -Slug." }

if (-not $DisplayName) {
  $DisplayName = ($Slug -split "-" | Where-Object { $_ } | ForEach-Object {
    $_.Substring(0,1).ToUpper() + $_.Substring(1)
  }) -join " "
}

Write-Host "Personalizing -> slug='$Slug'  display='$DisplayName'" -ForegroundColor Cyan

# 1) Token replacement (scoped to the files that carry the placeholders)
$slugFiles = @("package.json", ".env.example")
$nameFiles = @("frontend/index.html", "frontend/src/app/App.tsx",
               "frontend/src/features/auth/SignInPage.tsx")

foreach ($f in $slugFiles) {
  $p = Join-Path $root $f
  if (Test-Path $p) {
    (Get-Content $p -Raw).Replace("molde-app", $Slug) | Set-Content $p -NoNewline -Encoding UTF8
  }
}
foreach ($f in $nameFiles) {
  $p = Join-Path $root $f
  if (Test-Path $p) {
    (Get-Content $p -Raw).Replace("Molde App", $DisplayName) | Set-Content $p -NoNewline -Encoding UTF8
  }
}

# 2) Reset git to a clean history (new app == new repo)
if (-not $KeepGit) {
  if (Test-Path (Join-Path $root ".git")) { Remove-Item (Join-Path $root ".git") -Recurse -Force }
  git init -b main | Out-Null
  Write-Host "Git reset to a clean repo." -ForegroundColor DarkGray
}

# 3) Add .brief/ to .gitignore (keep private planning notes out of the app repo)
$gi = Join-Path $root ".gitignore"
if (-not (Select-String -Path $gi -Pattern "^\.brief/?$" -Quiet -ErrorAction SilentlyContinue)) {
  Add-Content $gi "`n# Private planning layer (stays local / OneDrive, never in the app repo)`n.brief/"
}

# 4) Generate JWT_SECRET + write .env from .env.example
$jwt = (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").Trim()
$envOut = Join-Path $root ".env"
if (-not (Test-Path $envOut)) {
  (Get-Content (Join-Path $root ".env.example") -Raw).Replace("JWT_SECRET=replace-me", "JWT_SECRET=$jwt") |
    Set-Content $envOut -NoNewline -Encoding UTF8
  Write-Host "Wrote .env (with generated JWT_SECRET)." -ForegroundColor DarkGray
}

# 5) Seed .brief/stack.md from the private master if available
$master = Join-Path $HOME ".config/molde/stack.md"
$briefStack = Join-Path $root ".brief/stack.md"
if ((Test-Path $master) -and (Test-Path (Split-Path $briefStack -Parent))) {
  Copy-Item $master $briefStack -Force
  Write-Host "Seeded .brief/stack.md from ~/.config/molde/stack.md" -ForegroundColor DarkGray
}

Write-Host "`nDone. Next: fill .brief/idea.md + .brief/inspiration/, then run the molde-new-app skill." -ForegroundColor Green
Write-Host "  app:  https://$Slug.parolin.net" -ForegroundColor Green
Write-Host "  api:  https://api-$Slug.parolin.net" -ForegroundColor Green

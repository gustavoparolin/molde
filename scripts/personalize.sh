#!/usr/bin/env bash
# Personalize a fresh Molde copy into a new app (bash twin of personalize.ps1).
#   ./scripts/personalize.sh [slug] [display-name]
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

slug="${1:-$(basename "$root")}"
slug="$(echo "$slug" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]/-/g; s/-{2,}/-/g; s/^-|-$//g')"
[ -n "$slug" ] || { echo "Could not derive a valid slug; pass one as the first arg." >&2; exit 1; }

if [ -n "${2:-}" ]; then
  display="$2"
else
  display="$(echo "$slug" | tr '-' ' ' | awk '{ for (i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2) }1')"
fi

echo "Personalizing -> slug='$slug'  display='$display'"

# 1) Token replacement
for f in package.json .env.example; do
  [ -f "$f" ] && sed -i "s/molde-app/$slug/g" "$f"
done
for f in frontend/index.html frontend/src/app/App.tsx frontend/src/features/auth/SignInPage.tsx; do
  [ -f "$f" ] && sed -i "s/Molde App/$display/g" "$f"
done

# 2) Reset git to a clean history
if [ "${KEEP_GIT:-}" != "1" ]; then
  rm -rf .git && git init -b main >/dev/null
  echo "Git reset to a clean repo."
fi

# 3) Add .brief/ to .gitignore
grep -qxE '\.brief/?' .gitignore || printf '\n# Private planning layer (stays local / OneDrive)\n.brief/\n' >> .gitignore

# 4) Generate JWT_SECRET + write .env
if [ ! -f .env ]; then
  jwt="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  sed "s/JWT_SECRET=replace-me/JWT_SECRET=$jwt/" .env.example > .env
  echo "Wrote .env (with generated JWT_SECRET)."
fi

# 5) Seed .brief/stack.md from the private master
master="$HOME/.config/molde/stack.md"
if [ -f "$master" ] && [ -d ".brief" ]; then
  cp "$master" ".brief/stack.md"
  echo "Seeded .brief/stack.md from ~/.config/molde/stack.md"
fi

echo ""
echo "Done. Next: fill .brief/idea.md + .brief/inspiration/, then run the molde-new-app skill."
echo "  app:  https://$slug.parolin.net"
echo "  api:  https://api-$slug.parolin.net"

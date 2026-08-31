#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT="$(dirname "$ROOT")"

pick_config_source() {
  for p in \
    "$PARENT/StudyNurse-v0.3.1" \
    "$PARENT/StudyNurse-v0.3.0" \
    "$PARENT/StudyNurse-v0.2.3"
  do
    if [[ -f "$p/config.js" ]] && grep -Eq 'https://[^"]+\.supabase\.co' "$p/config.js"; then
      echo "$p"
      return
    fi
  done
  return 1
}

pick_git_source() {
  for p in \
    "$PARENT/StudyNurse-v0.3.1" \
    "$PARENT/StudyNurse-v0.3.0" \
    "$PARENT/StudyNurse-v0.2.3"
  do
    if [[ -d "$p/.git" ]]; then
      echo "$p"
      return
    fi
  done
  return 1
}

CONFIG_SRC="$(pick_config_source || true)"
GIT_SRC="$(pick_git_source || true)"

cd "$ROOT"

echo "[1/4] Preserve PROD Supabase config"
if [[ -n "$CONFIG_SRC" ]]; then
  cp -f "$CONFIG_SRC/config.js" "$ROOT/config.js"
  sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.4.2"/' "$ROOT/config.js"
  if ! grep -q 'environment:' "$ROOT/config.js"; then
    sed -i '/version:/a\  environment: "PROD",' "$ROOT/config.js"
  fi
  echo "  copied: $CONFIG_SRC/config.js"
else
  echo "[WARN] Existing Supabase config not found. config.js must be filled manually."
fi

echo "[2/4] Preserve Git history / remote"
if [[ -n "$GIT_SRC" && ! -d "$ROOT/.git" ]]; then
  cp -a "$GIT_SRC/.git" "$ROOT/.git"
  echo "  copied: $GIT_SRC/.git"
else
  echo "  .git already present or previous git repository not found"
fi

echo "[3/4] Verify version"
"$ROOT/verify_version.sh"

echo "[4/4] Git status"
git status || true

echo
echo "Upgrade preparation complete."
echo
echo "IMPORTANT:"
echo "1) Run supabase_upgrade_0.4.2.sql in the PROD Supabase SQL Editor."
echo "2) Optional DEV DB: create a second Supabase project, run the same SQL, and fill config.dev.js."
echo "3) Test DEV with: https://ows2509.github.io/studynurse/?dev=1"
echo
echo "Deploy:"
echo "  git add -A"
echo '  git commit -m "StudyNurse v0.4.2"'
echo "  git push"

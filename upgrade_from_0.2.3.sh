#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT="$(dirname "$ROOT")"
PREV="$PARENT/StudyNurse-v0.2.3"

cd "$ROOT"

if [[ ! -d "$PREV" ]]; then
  echo "[ERROR] 이전 폴더를 찾지 못했습니다: $PREV"
  exit 1
fi

echo "[1/4] Preserve Supabase config"
if [[ -f "$PREV/config.js" ]]; then
  cp -f "$PREV/config.js" "$ROOT/config.js"
  sed -i 's/version:[[:space:]]*"0\.2\.3"/version: "0.3.0"/' "$ROOT/config.js"
  echo "  copied: $PREV/config.js"
else
  echo "[ERROR] 이전 config.js 없음"
  exit 2
fi

echo "[2/4] Preserve Git history / remote"
if [[ -d "$PREV/.git" && ! -d "$ROOT/.git" ]]; then
  cp -a "$PREV/.git" "$ROOT/.git"
  echo "  copied .git"
else
  echo "  .git already present or previous .git missing"
fi

echo "[3/4] Verify version"
"$ROOT/verify_version.sh"

echo "[4/4] Git status"
git status || true

echo
echo "Local upgrade preparation complete."
echo "IMPORTANT: Before git push, run supabase_upgrade_0.3.0.sql once in Supabase SQL Editor."
echo
echo "Then:"
echo "  git add -A"
echo '  git commit -m "StudyNurse v0.3.0"'
echo "  git push"

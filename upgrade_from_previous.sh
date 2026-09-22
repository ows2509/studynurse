#!/usr/bin/env bash
set -euo pipefail
ROOT="/mnt/e/google_drive/02_CODING/CODING/Studynurse"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREV=""
for x in "$ROOT/StudyNurse-v0.7.1" "$ROOT/StudyNurse-v0.7.0" "$ROOT/StudyNurse-v0.6.2"; do
  [[ -d "$x/.git" ]] && { PREV="$x"; break; }
done
[[ -n "$PREV" ]] || { echo "[ERROR] 이전 Git 저장소를 $ROOT 아래에서 찾지 못했습니다."; exit 1; }
for c in config.js config.dev.js; do
  if [[ -f "$PREV/$c" ]]; then
    cp -f "$PREV/$c" "$HERE/$c"
    sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.7.2"/' "$HERE/$c"
  fi
done
rm -rf "$HERE/.git"; cp -a "$PREV/.git" "$HERE/.git"; cd "$HERE"
git fetch origin
./verify_version.sh
echo "Supabase SQL: supabase_upgrade_0.7.2.sql"
echo "git add -A"
echo "git commit -m 'StudyNurse v0.7.2'"
echo "git rebase origin/main"
echo "git push"

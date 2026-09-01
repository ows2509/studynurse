#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT="$(dirname "$ROOT")"
PREV=""

for p in \
  "$PARENT/StudyNurse-v0.4.3" \
  "$PARENT/StudyNurse-v0.4.2" \
  "$PARENT/StudyNurse-v0.4.1"
do
  if [[ -d "$p/.git" ]]; then PREV="$p"; break; fi
done

[[ -n "$PREV" ]] || { echo "[ERROR] 이전 Git 폴더 없음"; exit 1; }

for cfg in config.js config.dev.js; do
  if [[ -f "$PREV/$cfg" ]]; then
    cp -f "$PREV/$cfg" "$ROOT/$cfg"
    sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.4.4"/' "$ROOT/$cfg"
  fi
done

rm -rf "$ROOT/.git"
cp -a "$PREV/.git" "$ROOT/.git"
cd "$ROOT"

git fetch origin
./verify_version.sh

echo
echo "준비 완료."
echo "1) Supabase SQL Editor: supabase_upgrade_0.4.4.sql"
echo "2) git add -A"
echo "3) git commit -m 'StudyNurse v0.4.4'"
echo "4) git rebase origin/main"
echo "5) git push"

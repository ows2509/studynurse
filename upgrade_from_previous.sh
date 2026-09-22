#!/usr/bin/env bash
set -euo pipefail
ROOT="/mnt/e/google_drive/02_CODING/CODING/Studynurse"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="0.7.4"
PREV=""
for x in "$ROOT/StudyNurse-v0.7.3" "$ROOT/StudyNurse-v0.7.2" "$ROOT/StudyNurse-v0.7.1"; do
  [[ -d "$x/.git" ]] && { PREV="$x"; break; }
done
[[ -n "$PREV" ]] || { echo "[ERROR] 이전 Git 저장소를 $ROOT 아래에서 찾지 못했습니다."; exit 1; }

for c in config.js config.dev.js; do
  if [[ -f "$PREV/$c" ]]; then
    cp -f "$PREV/$c" "$HERE/$c"
    sed -i "s/version:[[:space:]]*\"[^\"]*\"/version: \"$VERSION\"/" "$HERE/$c"
  fi
done

rm -rf "$HERE/.git"
cp -a "$PREV/.git" "$HERE/.git"
cd "$HERE"

# If the previous repository already uses SSH, keep it. Otherwise switch this
# cloned metadata to the user's StudyNurse SSH remote.
REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [[ "$REMOTE" == https://github.com/ows2509/studynurse.git* ]]; then
  git remote set-url origin git@github.com:ows2509/studynurse.git
fi

git fetch origin
./verify_version.sh

SQL_FILE="$HERE/supabase_upgrade_${VERSION}.sql"
echo
echo "============================================================"
echo " SUPABASE UPGRADE SQL - v${VERSION}"
echo "============================================================"
if [[ -f "$SQL_FILE" ]]; then
  cat "$SQL_FILE"
  echo
  echo "------------------------------------------------------------"
  if command -v clip.exe >/dev/null 2>&1; then
    clip.exe < "$SQL_FILE"
    echo "[OK] Supabase SQL copied to Windows clipboard."
    echo "     Supabase SQL Editor에서 Ctrl+V 후 실행하세요."
  else
    echo "[INFO] clip.exe 없음: SQL은 위 화면에서 복사하세요."
  fi
else
  echo "[WARN] SQL file not found: $SQL_FILE"
fi

echo
echo "============================================================"
echo " GIT DEPLOY"
echo "============================================================"
echo "SSH test: ssh -T git@github.com"
echo
echo "git add -A"
echo "git commit -m \"StudyNurse v${VERSION}\""
echo "git rebase origin/main"
echo "git push"

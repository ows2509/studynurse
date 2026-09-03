#!/usr/bin/env bash
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)"
P="$(dirname "$R")";V=""
for x in "$P/StudyNurse-v0.5.2" "$P/StudyNurse-v0.5.1" "$P/StudyNurse-v0.5.0";do
  if [[ -d "$x/.git" ]];then V="$x";break;fi
done
[[ -n "$V" ]]||{ echo "[ERROR] 이전 Git 저장소 없음";exit 1;}
for c in config.js config.dev.js;do
  if [[ -f "$V/$c" ]];then
    cp -f "$V/$c" "$R/$c"
    sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.5.3"/' "$R/$c"
  fi
done
rm -rf "$R/.git";cp -a "$V/.git" "$R/.git";cd "$R"
git fetch origin
./verify_version.sh
echo "Supabase: supabase_upgrade_0.5.3.sql"
echo "git add -A"
echo "git commit -m 'StudyNurse v0.5.3'"
echo "git rebase origin/main"
echo "git push"

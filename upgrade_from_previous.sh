#!/usr/bin/env bash
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)";P="$(dirname "$R")";V=""
for x in "$P/StudyNurse-v0.5.6" "$P/StudyNurse-v0.5.5" "$P/StudyNurse-v0.5.4";do [[ -d "$x/.git" ]]&&{ V="$x";break;};done
[[ -n "$V" ]]||{ echo "[ERROR] 이전 Git 저장소 없음";exit 1;}
for c in config.js config.dev.js;do [[ -f "$V/$c" ]]&&{ cp -f "$V/$c" "$R/$c";sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.6.1"/' "$R/$c";};done
rm -rf "$R/.git";cp -a "$V/.git" "$R/.git";cd "$R";git fetch origin;./verify_version.sh
echo "Supabase SQL: supabase_upgrade_0.6.1.sql";echo "git add -A";echo "git commit -m 'StudyNurse v0.6.1'";echo "git rebase origin/main";echo "git push"

#!/usr/bin/env bash
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)";P="$(dirname "$R")";V=""
for x in "$P/StudyNurse-v0.4.4" "$P/StudyNurse-v0.4.3" "$P/StudyNurse-v0.4.2";do [[ -d "$x/.git" ]]&&{ V="$x";break;};done
[[ -n "$V" ]]||{ echo "[ERROR] 이전 Git 없음";exit 1;}
for c in config.js config.dev.js;do [[ -f "$V/$c" ]]&&{ cp "$V/$c" "$R/$c";sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.4.5"/' "$R/$c";};done
rm -rf "$R/.git";cp -a "$V/.git" "$R/.git";cd "$R";git fetch origin;./verify_version.sh
echo "SQL 실행 후: git add -A && git commit -m 'StudyNurse v0.4.5' && git rebase origin/main && git push"

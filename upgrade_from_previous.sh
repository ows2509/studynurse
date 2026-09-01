#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)";PARENT="$(dirname "$ROOT")";PREV=""
for p in "$PARENT/StudyNurse-v0.4.2" "$PARENT/StudyNurse-v0.4.1" "$PARENT/StudyNurse-v0.4.0";do [[ -d "$p/.git" ]]&&{ PREV="$p";break;};done
[[ -n "$PREV" ]]||{ echo "[ERROR] 이전 Git 폴더 없음";exit 1;}
for cfg in config.js config.dev.js;do [[ -f "$PREV/$cfg" ]]&&{ cp -f "$PREV/$cfg" "$ROOT/$cfg";sed -i 's/version:[[:space:]]*"[^"]*"/version: "0.4.3"/' "$ROOT/$cfg";};done
rm -rf "$ROOT/.git";cp -a "$PREV/.git" "$ROOT/.git";cd "$ROOT";git fetch origin;./verify_version.sh
echo "준비 완료. SQL 실행 후 git add -A && git commit -m 'StudyNurse v0.4.3' && git rebase origin/main && git push"

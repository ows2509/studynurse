#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
VERSION="$(tr -d '\r\n ' < VERSION)"

./verify_version.sh

if [[ ! -d .git ]]; then
  git init
  git branch -M main
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "StudyNurse v${VERSION}"
fi

echo
echo "GitHub에서 빈 저장소 'studynurse'를 만든 후 아래 두 명령을 실행하세요."
echo
echo "git remote add origin https://github.com/<YOUR_GITHUB_ID>/studynurse.git"
echo "git push -u origin main"
echo
echo "그 다음 GitHub > Settings > Pages > Source > GitHub Actions"

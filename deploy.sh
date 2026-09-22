#!/usr/bin/env bash
set -euo pipefail
VERSION="$(tr -d '\r\n' < VERSION)"
REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [[ "$REMOTE" != git@github.com:* ]]; then
  echo "[ERROR] Git origin이 SSH가 아닙니다: $REMOTE"
  echo "먼저: git remote set-url origin git@github.com:ows2509/studynurse.git"
  exit 1
fi

echo "[1/5] SSH authentication"
ssh -o BatchMode=yes -T git@github.com 2>&1 | grep -E "successfully authenticated|does not provide shell access" || {
  code=${PIPESTATUS[0]}
  # GitHub ssh -T normally exits 1 even on successful auth, so verify with fetch.
  echo "[INFO] GitHub SSH shell test exit=$code; continuing with git fetch verification."
}

echo "[2/5] Fetch"
git fetch origin

echo "[3/5] Stage/commit"
git add -A
if git diff --cached --quiet; then
  echo "[INFO] 새 commit 대상 변경사항 없음."
else
  git commit -m "StudyNurse v${VERSION}"
fi

echo "[4/5] Rebase"
if ! git rebase origin/main; then
  echo
  echo "[STOP] Rebase conflict. 자동 덮어쓰기는 하지 않았습니다."
  echo "git status 로 충돌을 확인한 뒤 해결하세요."
  exit 1
fi

echo "[5/5] Push"
git push origin main

echo
echo "[OK] StudyNurse v${VERSION} deploy complete."

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(tr -d '\r\n ' < "$ROOT/VERSION")"
FAIL=0

echo "[INFO] Expected version: ${VERSION}"

check() {
  if grep -Fq "$2" "$ROOT/$1"; then
    echo "[ OK ] $1"
  else
    echo "[FAIL] $1"
    FAIL=1
  fi
}

check "index.html" "StudyNurse v${VERSION}"
check "config.js" "version: \"${VERSION}\""
check "service-worker.js" "studynurse-v${VERSION}"

if grep -Rni --exclude-dir=.git --exclude=VERSION --exclude=verify_version.sh -E '0\.2\.[0-2]' "$ROOT" >/tmp/sn_old.txt 2>/dev/null; then
  echo "[FAIL] Previous version strings remain:"
  cat /tmp/sn_old.txt
  FAIL=1
else
  echo "[ OK ] No older v0.2.x strings remain"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "VERSION CHECK FAILED"
  exit 1
fi

echo "VERSION CHECK PASSED: StudyNurse v${VERSION}"

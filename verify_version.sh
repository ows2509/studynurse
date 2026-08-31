#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(tr -d '\r\n ' < "$ROOT/VERSION")"
FAIL=0

echo "[INFO] Expected version: ${VERSION}"

check(){
  if grep -Fq "$2" "$ROOT/$1"; then
    echo "[ OK ] $1"
  else
    echo "[FAIL] $1"
    FAIL=1
  fi
}

check index.html "StudyNurse v${VERSION}"
check config.js "version: \"${VERSION}\""
check config.dev.js "version: \"${VERSION}\""
check service-worker.js "studynurse-v${VERSION}"
check app.js "APP_VERSION = '${VERSION}'"

if [[ "$FAIL" -ne 0 ]]; then
  echo "VERSION CHECK FAILED"
  exit 1
fi

echo "VERSION CHECK PASSED: StudyNurse v${VERSION}"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(tr -d '\r\n ' < "$ROOT/VERSION")"
cd "$ROOT"
"$ROOT/verify_version.sh"
echo
echo "StudyNurse v${VERSION} -> http://127.0.0.1:8080/"
echo "DEV mode -> http://127.0.0.1:8080/?dev=1"
python3 -m http.server 8080 --bind 0.0.0.0

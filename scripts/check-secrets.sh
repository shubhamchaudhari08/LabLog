#!/usr/bin/env bash
# Enforces Constitution Principle III mechanically rather than by code review.
# Fails if any privileged credential name appears anywhere under web/.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

PATTERN='SERVICE_ROLE|ASSEMBLYAI_API_KEY|JWT_SECRET'

hits=$(grep -rnE "$PATTERN" web/ \
        --exclude-dir=node_modules \
        --exclude-dir=.next \
        --exclude-dir=coverage 2>/dev/null)

if [ -n "$hits" ]; then
  echo "FAIL: privileged credential name found in web/ (Constitution Principle III)"
  echo "$hits"
  exit 1
fi

echo "PASS: no privileged credential names under web/"

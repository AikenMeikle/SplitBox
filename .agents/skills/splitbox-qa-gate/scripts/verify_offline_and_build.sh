#!/usr/bin/env bash
set -euo pipefail

echo "=== [1/4] Checking for forbidden external runtime URLs (CDNs / Google Fonts / remote images) ==="
if [ -f index.html ]; then
  if grep -En 'https?://' index.html | grep -Ev 'www\.w3\.org/2000/svg' >/dev/null 2>&1; then
    echo "FAIL: External URL found in index.html (must be 100% offline):"
    grep -En 'https?://' index.html | grep -Ev 'www\.w3\.org/2000/svg'
    exit 1
  fi
fi

if [ -d src ]; then
  if grep -REn 'https?://' src/ | grep -Ev 'www\.w3\.org/2000/svg|localhost|127\.0\.0\.1' >/dev/null 2>&1; then
    echo "FAIL: External URL found in src/ (must be 100% offline):"
    grep -REn 'https?://' src/ | grep -Ev 'www\.w3\.org/2000/svg|localhost|127\.0\.0\.1'
    exit 1
  fi
fi
echo "PASS: Zero external runtime URLs detected."

echo "=== [2/4] Checking for stray USD ($) price strings in src/ ==="
if [ -d src ]; then
  if grep -REn '\$[0-9]+\.[0-9]{2}' src/ >/dev/null 2>&1; then
    echo "FAIL: Found USD ($) price string in src/ — all prices must be GBP (£):"
    grep -REn '\$[0-9]+\.[0-9]{2}' src/
    exit 1
  fi
fi
echo "PASS: GBP (£) currency check clean."

echo "=== [3/4] Checking bundled SplitBox brand assets ==="
if [ ! -f public/assets/splitbox-icon.svg ] && [ ! -f src/assets/splitbox-icon.svg ]; then
  echo "WARN: splitbox-icon.svg not yet copied into public/assets/ or src/assets/."
  exit 1
fi
echo "PASS: SplitBox SVG brand assets bundled locally."

echo "=== [4/4] Running production TypeScript + Vite build ==="
npm run build
echo "=== ALL AUTOMATED QA GATES PASSED ==="

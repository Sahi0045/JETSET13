#!/usr/bin/env bash
# Builds the stylesheet design-sync ships as cfg.cssEntry.
#
# Two parts, concatenated in this order:
#   1. tokens.css  — :root custom properties + the Google Fonts @import.
#                    Must come first: CSS requires @import before any rule.
#   2. the compiled Tailwind output — base, the @layer components vocabulary
#      (.btn, .card, .form-input, .glass-card ...), and the utilities actually
#      used by the components and the authored previews.
#
# Rendered designs only receive the transitive @import closure of styles.css,
# so anything the components need to look right has to be in this one file.
set -euo pipefail
cd "$(dirname "$0")/../.."

npx tailwindcss \
  -c .design-sync/build/tailwind.ds.config.js \
  -i frontend/styles/app.css \
  -o .design-sync/build/tailwind.out.css

cat .design-sync/build/tokens.css .design-sync/build/tailwind.out.css \
  > .design-sync/build/app.compiled.css

echo "built .design-sync/build/app.compiled.css ($(wc -c < .design-sync/build/app.compiled.css) bytes)"

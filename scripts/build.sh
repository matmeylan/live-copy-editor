#!/usr/bin/env bash
# Package the extension into dist/live-copy-editor.zip.
# Usage: scripts/build.sh [version]
#   version  optional; overrides "version" in manifest.json inside the zip only.
set -euo pipefail
cd "$(dirname "$0")/.."

# Only these ship to users. Docs, screenshots, CI files stay out of the package.
FILES=(manifest.json background.js content.js content.css panel.html panel.css panel.js icons)

rm -rf dist && mkdir -p dist/pkg
cp -R "${FILES[@]}" dist/pkg/

if [[ -n "${1:-}" ]]; then
  node -e '
    const fs = require("fs"), f = "dist/pkg/manifest.json";
    const m = JSON.parse(fs.readFileSync(f, "utf8"));
    m.version = process.argv[1];
    fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
  ' "$1"
fi

(cd dist/pkg && zip -qr ../live-copy-editor.zip .)
echo "Built dist/live-copy-editor.zip (version $(node -p 'require("./dist/pkg/manifest.json").version'))"

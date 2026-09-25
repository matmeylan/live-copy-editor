#!/usr/bin/env bash
# Fast sanity checks run in CI before anything is published.
set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
  const m = require("./manifest.json");
  const fail = (msg) => { console.error("manifest.json: " + msg); process.exit(1); };
  if (m.manifest_version !== 3) fail("manifest_version must be 3");
  if (!/^\d+(\.\d+){0,3}$/.test(m.version)) fail("version must be 1-4 dot-separated integers");
  const fs = require("fs");
  const refs = [m.background.service_worker, m.side_panel.default_path,
    ...Object.values(m.icons), ...m.content_scripts.flatMap(c => [...c.js, ...c.css])];
  for (const r of refs) if (!fs.existsSync(r)) fail("missing file " + r);
  console.log("manifest.json ok (v" + m.version + ")");
'
for f in background.js content.js panel.js; do node --check "$f"; done
echo "JS syntax ok"

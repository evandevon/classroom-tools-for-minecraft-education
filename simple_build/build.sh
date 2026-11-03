#!/usr/bin/env bash
# Builds Classroom_Tools.mcaddon from the source in this repository.
# Run from this folder: npm install, then npm run build
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source="$here/../regolith/filters_data/modular_mc/educator_tools/logic/main.ts"
NODE_PATH="$here/node_modules" npx esbuild "$source" --bundle --format=esm \
  --platform=neutral --target=es2020 --main-fields=module,main \
  --external:@minecraft/server --external:@minecraft/server-ui \
  --outfile="$here/pack/behavior_packs/0/scripts/edu_tools/main.js"
rm -f "$here/Classroom_Tools.mcaddon"
(cd "$here/pack" && zip -qr -X "$here/Classroom_Tools.mcaddon" .)
echo "Built $here/Classroom_Tools.mcaddon"

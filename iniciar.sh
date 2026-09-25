#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  NMS Corvette Shipyard - lanzador local (macOS / Linux)
#  Uso:  ./iniciar.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Falta Node.js. Instalalo desde https://nodejs.org (version LTS)"
  echo
  exit 1
fi

[ -d node_modules ] || { echo "  Instalando dependencias..."; npm install --no-audit --no-fund; }
[ -f out/index.html ] || { echo "  Compilando la aplicacion..."; npm run build:static; }

echo "  Arrancando el Shipyard..."
npm run start:local

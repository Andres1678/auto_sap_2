#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Validando backend =="
cd "$ROOT/backend"
python3 -m py_compile routes.py models.py

echo "== Validando imports React duplicados =="
cd "$ROOT/frontend"
grep -R "^import React" -n src/CalificacionCoeSapFuncional.jsx src/DashboardClientesCoeSap.jsx src/CargarBasesAuxiliaresCoeSap.jsx || true

echo "== Nota =="
echo "Para validar frontend completamente ejecuta: cd frontend && npm install && npm run build"

echo "OK"

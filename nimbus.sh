#!/usr/bin/env bash
# ============================================================
# Nimbus — Nuclear & Impact Modeling & Blast Understanding System
# One-click launcher: setup-on-first-run + dev server.
# Run "./nimbus.sh [cmd]" from the repo root.
#
# Subcommands:
#   ./nimbus.sh            -> dev server (default)
#   ./nimbus.sh setup      -> install deps and stop
#   ./nimbus.sh test       -> unit tests
#   ./nimbus.sh build      -> production build
#   ./nimbus.sh preview    -> build + serve production locally
#   ./nimbus.sh e2e        -> Playwright end-to-end tests
#   ./nimbus.sh report     -> open Playwright HTML report
# ============================================================

set -euo pipefail

# Always run from the repo root.
cd "$(dirname "$0")"

CMD="${1:-dev}"

echo
echo "============================================"
echo " Nimbus — Nuclear & Impact Modeling & Blast Understanding System"
echo "============================================"
echo

# 1) Verify Node is installed.
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found on PATH."
  echo "        Install Node 20 LTS from https://nodejs.org/ and re-run."
  exit 1
fi

# 2) Verify Node major >= 20.
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[ERROR] Node 20 LTS or newer required."
  echo "        You have: $(node -v)"
  echo "        Upgrade from https://nodejs.org/ and re-run."
  exit 1
fi

# 3) Enable Corepack so the right pnpm version comes online.
corepack enable >/dev/null 2>&1 || true

# 4) Install dependencies if node_modules is missing.
if [ ! -f "node_modules/.modules.yaml" ]; then
  echo "[SETUP] First-run install (this takes ~1 minute)..."
  pnpm install --frozen-lockfile
  echo "[OK] Dependencies installed."
fi

case "$CMD" in
  setup)
    echo
    echo "[OK] Setup complete. Run './nimbus.sh' to start the dev server."
    ;;

  test)
    echo "[RUN] Unit tests..."
    pnpm test
    ;;

  build)
    echo "[RUN] Production build..."
    pnpm build
    ;;

  preview)
    echo "[RUN] Build + preview server..."
    pnpm build
    pnpm preview
    ;;

  e2e)
    # Install Playwright browsers on first E2E run only.
    case "$(uname -s)" in
      Darwin*)  PW_CACHE="$HOME/Library/Caches/ms-playwright" ;;
      *)        PW_CACHE="$HOME/.cache/ms-playwright" ;;
    esac
    if [ ! -d "$PW_CACHE" ]; then
      echo "[SETUP] Installing Playwright browsers (first-run, ~3 minutes)..."
      pnpm exec playwright install --with-deps
    fi
    pnpm test:e2e
    ;;

  report)
    pnpm exec playwright show-report
    ;;

  dev)
    echo "[RUN] Dev server on http://localhost:5173"
    echo "      Press Ctrl+C to stop."
    echo
    pnpm dev
    ;;

  *)
    echo "[ERROR] Unknown command: $CMD"
    echo "        Usage: ./nimbus.sh [dev|setup|test|build|preview|e2e|report]"
    exit 1
    ;;
esac

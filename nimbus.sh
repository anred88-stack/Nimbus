#!/usr/bin/env bash
# ============================================================
# Nimbus — Nuclear & Impact Modeling & Blast Understanding System
# One-click launcher: setup-on-first-run + dev server + optional
# Tier-3 GeoClaw fixture pipeline.
#
# Run "./nimbus.sh [cmd]" from the repo root.
#
# Standard subcommands:
#   ./nimbus.sh                -> dev server (default)
#   ./nimbus.sh setup          -> install pnpm deps and stop
#   ./nimbus.sh check          -> typecheck + lint + unit tests (CI sanity)
#   ./nimbus.sh test           -> unit tests
#   ./nimbus.sh build          -> production build
#   ./nimbus.sh preview        -> build + serve production locally
#   ./nimbus.sh e2e            -> Playwright end-to-end tests
#   ./nimbus.sh report         -> open Playwright HTML report
#   ./nimbus.sh validate       -> Tier 0/1/2/3 validation suite
#
# GeoClaw Tier-3 pipeline (optional, Linux native or macOS):
#   ./nimbus.sh geoclaw setup           -> one-time toolchain install (~5 min)
#   ./nimbus.sh geoclaw run <scenario>  -> run one scenario
#   ./nimbus.sh geoclaw batch named     -> regenerate all 7 historical fixtures
#   ./nimbus.sh geoclaw batch custom    -> regenerate all 8 custom-grid fixtures
#   ./nimbus.sh geoclaw batch all       -> regenerate the lot
#   ./nimbus.sh geoclaw test            -> just the geoclawComparison.test.ts
# ============================================================

set -euo pipefail

# Always run from the repo root.
cd "$(dirname "$0")"

CMD="${1:-dev}"
SUBCMD="${2:-}"
ARG3="${3:-}"

echo
echo "============================================"
echo " Nimbus — Nuclear & Impact Modeling & Blast Understanding System"
echo "============================================"
echo

# ---------- GeoClaw subcommands route early (no Node needed) ----------
if [ "$CMD" = "geoclaw" ]; then
  case "$SUBCMD" in
    setup)
      echo "[GEOCLAW] One-time toolchain install."
      echo "          Installs gfortran + python3-venv + clawpack 5.14 + numpy/matplotlib/scipy."
      echo "          Disk: ~1 GB. Time: ~5 minutes on first run, instant on re-runs."
      echo "          (Will sudo apt install — you may be prompted for your password.)"
      echo
      sudo bash scripts/geoclaw/install.sh
      echo
      echo "[OK] GeoClaw toolchain ready. Try:"
      echo "      ./nimbus.sh geoclaw run tohoku-2011"
      echo "      ./nimbus.sh geoclaw batch all"
      exit 0
      ;;
    run)
      if [ -z "$ARG3" ]; then
        echo "[ERROR] Usage: ./nimbus.sh geoclaw run <scenario-id>"
        echo "        See scripts/geoclaw/scenarios.json for available IDs."
        exit 1
      fi
      echo "[GEOCLAW] Running scenario: $ARG3"
      bash scripts/geoclaw/_run_one.sh "$ARG3"
      exit 0
      ;;
    batch)
      case "$ARG3" in
        named)
          echo "[GEOCLAW] Re-running all 7 named historical scenarios..."
          bash scripts/geoclaw/_batch_named.sh
          ;;
        custom)
          echo "[GEOCLAW] Re-running all 8 custom-input scenarios..."
          bash scripts/geoclaw/_batch_custom.sh
          ;;
        all)
          echo "[GEOCLAW] Re-running ALL named + custom scenarios..."
          bash scripts/geoclaw/_batch_named.sh
          bash scripts/geoclaw/_batch_custom.sh
          echo
          echo "[GEOCLAW] All fixtures regenerated. Re-run './nimbus.sh geoclaw test' to pin Nimbus against them."
          ;;
        *)
          echo "[ERROR] Usage: ./nimbus.sh geoclaw batch [named|custom|all]"
          exit 1
          ;;
      esac
      exit 0
      ;;
    test)
      echo "[GEOCLAW] Running comparator against committed fixtures (no GeoClaw install needed)..."
      pnpm test src/physics/validation/geoclawComparison
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown geoclaw subcommand: $SUBCMD"
      echo "        Usage: ./nimbus.sh geoclaw [setup|run <id>|batch named|custom|all|test]"
      exit 1
      ;;
  esac
fi

# ---------- 1) Verify Node is installed ----------
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found on PATH."
  echo "        Install Node 20 LTS from https://nodejs.org/ and re-run."
  exit 1
fi

# ---------- 2) Verify Node major >= 20 ----------
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[ERROR] Node 20 LTS or newer required."
  echo "        You have: $(node -v)"
  echo "        Upgrade from https://nodejs.org/ and re-run."
  exit 1
fi

# ---------- 3) Enable Corepack so the right pnpm version comes online ----------
corepack enable >/dev/null 2>&1 || true

# ---------- 4) Install pnpm dependencies if node_modules is missing ----------
if [ ! -f "node_modules/.modules.yaml" ]; then
  echo "[SETUP] First-run pnpm install (~1 minute)..."
  pnpm install --frozen-lockfile
  echo "[OK] pnpm dependencies installed."
fi

# ---------- 4b) First-run Playwright browsers ----------
case "$(uname -s)" in
  Darwin*)  PW_CACHE="$HOME/Library/Caches/ms-playwright" ;;
  *)        PW_CACHE="$HOME/.cache/ms-playwright" ;;
esac
if [ ! -d "$PW_CACHE" ]; then
  echo "[SETUP] Installing Playwright browsers (one-time, ~3 minutes, ~500 MB)..."
  if pnpm exec playwright install --with-deps; then
    echo "[OK] Playwright browsers installed."
  else
    echo "[WARN] Playwright install failed - E2E tests will not work until you run './nimbus.sh e2e'."
  fi
fi

# ---------- 4c) First-run GeoClaw toolchain ----------
# Needed for `./nimbus.sh geoclaw run/batch` to regenerate Tier-3 fixtures.
# The committed fixtures + `./nimbus.sh validate` work without it.
CLAW_VENV="${VENV_HOME:-/root/clawenv}"
if [ ! -x "$CLAW_VENV/bin/python" ] || ! "$CLAW_VENV/bin/python" -c 'import clawpack' >/dev/null 2>&1; then
  echo "[SETUP] Installing GeoClaw Tier-3 toolchain (one-time, ~5 minutes, ~1 GB)..."
  if [ "$(id -u)" = "0" ]; then
    bash scripts/geoclaw/install.sh || echo "[WARN] GeoClaw install failed - Tier-3 fixture regeneration will not work."
  elif command -v sudo >/dev/null 2>&1; then
    echo "        (sudo password may be requested for apt-get)"
    sudo bash scripts/geoclaw/install.sh || echo "[WARN] GeoClaw install failed - retry with: ./nimbus.sh geoclaw setup"
  else
    echo "[WARN] GeoClaw install needs root or sudo - skipping. Retry with: ./nimbus.sh geoclaw setup"
  fi
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

  check)
    echo "[RUN] Typecheck + lint + unit tests..."
    pnpm typecheck
    pnpm lint
    pnpm test
    ;;

  validate)
    echo "[RUN] Validation suite (Tier 0/1/2/3 — uses committed GeoClaw fixtures, no install needed)..."
    pnpm test src/physics/validation
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
    echo "        Usage: ./nimbus.sh [dev|setup|check|test|validate|build|preview|e2e|report|geoclaw ...]"
    exit 1
    ;;
esac

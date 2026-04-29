#!/usr/bin/env bash
# Run every named historical scenario through GeoClaw and write its
# fixture JSON. ~2-3 min total compute on a 4-core laptop.
set -uo pipefail
source "${VENV_HOME:-/root/clawenv}/bin/activate"
export CLAW="${CLAW_HOME:-/root/clawpack-src}"
export FC=gfortran
cd "$(dirname "$0")"

for scenario in tohoku-2011 sumatra-2004 maule-2010 cascadia-m9 krakatau-1883 storegga-8200bp eltanin-2.5ma; do
  echo "============================================================"
  echo "=== $scenario ==="
  echo "============================================================"
  python -u run_scenario.py "$scenario" || echo "*** $scenario FAILED ***"
done

#!/usr/bin/env bash
# Run every custom-input grid scenario through GeoClaw. ~1-2 min total.
set -uo pipefail
source "${VENV_HOME:-/root/clawenv}/bin/activate"
export CLAW="${CLAW_HOME:-/root/clawpack-src}"
export FC=gfortran
cd "$(dirname "$0")"

for scenario in \
  custom-seismic-mw75-l300km \
  custom-seismic-mw85-l700km \
  custom-seismic-mw95-l1500km \
  custom-volcanic-small \
  custom-volcanic-large \
  custom-landslide-small \
  custom-landslide-large \
  custom-impact-3km
do
  echo "============================================================"
  echo "=== $scenario ==="
  echo "============================================================"
  python -u run_scenario.py "$scenario" || echo "*** $scenario FAILED ***"
done

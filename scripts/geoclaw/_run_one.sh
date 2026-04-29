#!/usr/bin/env bash
# Run a single GeoClaw scenario by id. Used by `nimbus geoclaw run <id>`.
set -uo pipefail
source "${VENV_HOME:-/root/clawenv}/bin/activate"
export CLAW="${CLAW_HOME:-/root/clawpack-src}"
export FC=gfortran
cd "$(dirname "$0")"
python -u run_scenario.py "$1"

#!/usr/bin/env bash
# ============================================================
# Tier-3 GeoClaw toolchain installer (Linux / WSL2 Ubuntu).
#
# Idempotent: each step is skipped if already done. Re-run to
# repair a broken install (e.g. after `wsl --unregister`).
#
#   apt:    gfortran, python3-venv, build-essential, git, python-is-python3
#   venv:   /root/clawenv  (or $HOME/clawenv if not root)
#   pip:    clawpack 5.14.0, meson, numpy, matplotlib, scipy, six
#   git:    /root/clawpack-src  (clawpack source tree, shallow)
# ============================================================

set -euo pipefail

CLAW_HOME="${CLAW_HOME:-/root/clawpack-src}"
VENV_HOME="${VENV_HOME:-/root/clawenv}"

echo "============================================"
echo " Nimbus Tier-3 GeoClaw toolchain installer"
echo "============================================"
echo "  CLAW_HOME = $CLAW_HOME"
echo "  VENV_HOME = $VENV_HOME"
echo

# 1) APT packages ---------------------------------------------
need_apt=()
for pkg in gfortran python3-venv build-essential git python-is-python3; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    need_apt+=("$pkg")
  fi
done
if [ "${#need_apt[@]}" -gt 0 ]; then
  echo "[APT] Installing: ${need_apt[*]}"
  apt-get update
  apt-get install -y "${need_apt[@]}"
else
  echo "[APT] All required packages already installed."
fi

# 2) Python venv ----------------------------------------------
if [ ! -f "$VENV_HOME/bin/activate" ]; then
  echo "[VENV] Creating $VENV_HOME"
  python3 -m venv "$VENV_HOME"
else
  echo "[VENV] $VENV_HOME already exists."
fi
# shellcheck disable=SC1091
source "$VENV_HOME/bin/activate"

# 3) pip packages ---------------------------------------------
pip install --upgrade pip wheel meson >/dev/null
echo "[PIP] Installing clawpack + numpy + matplotlib + scipy + six"
pip install --upgrade clawpack numpy matplotlib scipy six >/dev/null

# 4) Clawpack source tree (Fortran kernel + Makefiles) --------
if [ ! -d "$CLAW_HOME/.git" ]; then
  echo "[GIT] Cloning clawpack source to $CLAW_HOME (~2 min, shallow)"
  git clone --depth 1 https://github.com/clawpack/clawpack.git "$CLAW_HOME"
else
  echo "[GIT] $CLAW_HOME already cloned (skipping)."
fi

# 5) Sanity check ---------------------------------------------
echo
echo "[CHECK] clawpack version:"
python -c "import clawpack; print('  ', clawpack.__version__)"
echo "[CHECK] gfortran:"
gfortran --version | head -1 | sed 's/^/  /'
echo

cat <<EOF
============================================
 GeoClaw setup complete.

 Use it via:
   nimbus geoclaw run <scenario-id>
   nimbus geoclaw batch named
   nimbus geoclaw batch custom
   nimbus geoclaw test

 Available scenarios live in scripts/geoclaw/scenarios.json.
============================================
EOF

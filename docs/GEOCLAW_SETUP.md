# GeoClaw setup and fixture generation

This page walks through the one-time setup needed to populate the
**Tier 3 GeoClaw fixture set** in
[`src/physics/validation/geoclawFixtures/`](../src/physics/validation/geoclawFixtures/).
The fixtures pin Nimbus output against the same numbers a NOAA-accepted
solver produces for canonical historical events, closing the
"validated against the standard of the field" claim that Tier 1 (analytic
formulas) and Tier 2 (Saint-Venant 1D) leave open.

You do this **once per GeoClaw release** (every ~12-18 months when
clawpack ships a new minor) and re-commit the JSON. The Nimbus CI then
fails any future change that drifts more than the documented tolerance.

## Why GeoClaw

[GeoClaw](https://www.clawpack.org/geoclaw.html) is the open-source
adaptive-mesh tsunami solver maintained by Randall LeVeque's group at
the University of Washington. NOAA, USGS, NTHMP, and the Pacific Tsunami
Warning Centre all use it as one of the accepted reference codes. License:
BSD-3-Clause.

We use it offline, never in the browser. The TypeScript Saint-Venant 1D
solver in [src/physics/tsunami/saintVenant1D.ts](../src/physics/tsunami/saintVenant1D.ts)
shares its kernel ideas (HLL Riemann + MUSCL TVD + Manning friction)
with GeoClaw's first-order educational variant; the Tier 3 comparison
keeps us honest.

## Prerequisites

- **macOS, Linux, or Windows + WSL2.** GeoClaw's Fortran kernel does
  not build natively under Windows MSVC; WSL2 with Ubuntu 22.04 LTS
  is the simplest Windows path. See the Windows-specific section
  below for step-by-step.
- **gfortran 11+** (`sudo apt install gfortran` on Ubuntu).
- **Python 3.9+** with `pip`.
- ~2 GB free disk for the source tree + scratch output.
- ~1-2 hours of wall-clock to run all 6 scenarios on a 4-core laptop.

## Windows 11 — WSL2 path (recommended)

Microsoft ships WSL2 (Linux Subsystem for Windows) for free on Windows
10/11. After WSL2 is installed once, every GeoClaw command in this doc
runs from a Bash prompt inside the Ubuntu VM. The Nimbus repo on the
Windows side is reachable from Ubuntu at `/mnt/c/Users/<you>/...`.

```powershell
# In an *administrator* PowerShell, install Ubuntu 22.04 once:
wsl --install -d Ubuntu-22.04
# Reboot if prompted, then launch "Ubuntu" from the Start menu.
# Pick a Linux username + password the first time.
```

Inside the new Ubuntu shell:

```sh
# Toolchain (~1 minute)
sudo apt update
sudo apt install -y gfortran python3 python3-pip python3-venv build-essential

# Optional: a venv keeps clawpack out of the system Python
python3 -m venv ~/clawenv
source ~/clawenv/bin/activate

# Clawpack (≈ 5-10 minutes to download + compile)
pip install clawpack

# Sanity check
export CLAW=$(python -c "import clawpack; print(clawpack.__path__[0])")
cd "$CLAW/geoclaw/examples/tsunami/chile2010"
make .output      # ~1 minute
ls _output | head # should show fort.t0000, fort.q0000, fort.q0001, ...
```

If `make .output` succeeds you have a working GeoClaw. From here, the
fixture-generation steps below run identically on Linux, macOS, or WSL2
Ubuntu.

To reach the Nimbus repo from inside Ubuntu (so the extract script can
write the JSON fixture into the right folder):

```sh
cd /mnt/c/Users/panzo/Desktop/Nimbus-main
# the rest of the commands in this doc run from here
```

## Install (≈ 30 minutes total) — Linux / macOS shortcut

```sh
pip install clawpack
export CLAW=$(python -c "import clawpack; print(clawpack.__path__[0])")
cd "$CLAW/geoclaw/examples/tsunami/chile2010"
make .output
make plots
```

If `make .output` produces a `_output/` directory full of `fort.t*` and
`fort.q*` files, you are ready.

## Scenarios we ship

Six canonical events, listed in [scenarios.json](../scripts/geoclaw/scenarios.json).
Each has a `setrun.py` template, a probe list, and the published
reference value the GeoClaw run is expected to reproduce.

| Scenario          | Source                              | Reference                           |
| ----------------- | ----------------------------------- | ----------------------------------- |
| `tohoku-2011`     | Mw 9.1 megathrust, 700 km rupture   | DART 21413 peak 0.30 m at 1500 km   |
| `sumatra-2004`    | Mw 9.1 megathrust, 1300 km rupture  | Cocos Island 0.40 m at 1700 km      |
| `krakatau-1883`   | Volcanic flank collapse, 4 km³      | Anjer tide gauge 36 m run-up        |
| `storegga-8200bp` | Submarine landslide, 3000 km³       | Norwegian coast 10 m sediment scour |
| `cascadia-m9`     | Modelled Mw 9.0 megathrust scenario | Modelled DART benchmark             |
| `eltanin-2.5ma`   | 1 km asteroid, 5 km Pacific basin   | Geological "no crater" record       |

## Generating a fixture

The `scripts/geoclaw/` directory contains:

- `setrun_template.py` — parametrised GeoClaw `setrun.py`.
- `scenarios.json` — per-scenario inputs.
- `extract_results.py` — reads GeoClaw `_output/fort.q*` and writes a
  Nimbus-compatible JSON fixture.

```sh
cd scripts/geoclaw
python run_scenario.py tohoku-2011
# ... GeoClaw runs (~5-15 min for tohoku) ...
python extract_results.py tohoku-2011
# writes ../../src/physics/validation/geoclawFixtures/tohoku-2011.json
```

After running all 6 scenarios:

```sh
cd ../..
pnpm test src/physics/validation/geoclawComparison
```

If a fixture file's `geoclawProbes` array is non-empty, the
corresponding test runs the Nimbus model with the same input and asserts
that the predicted amplitudes stay within `GEOCLAW_PIN_TOLERANCE` of the
GeoClaw values. Empty/placeholder fixtures are marked as `it.todo` so
the suite stays green until you've populated them.

## Tolerance rationale

Default pin: `±25 %` per probe. This matches the Synolakis et al. 2008
"intercomparison spread" envelope when different operational solvers
(MOST, GeoClaw, COMCOT, Tsunami-HySEA) ran the same NOAA benchmark — it
is the inherent operational-grade scatter. Tighter pins are not
defensible because Nimbus is a closed-form / 1D solver, not a 2D
adaptive-mesh solver: pinning to ±5 % would be claiming we solve
exactly the same problem.

## Re-running the suite after a model change

If you intentionally re-calibrate the closed-form pipeline (Sprint 1
Manning constants, Sprint 2 dispersion length, etc.):

1. Run `pnpm test src/physics/validation/geoclawComparison` first.
2. If the test fails inside the +`±25 %` band, that is **expected** —
   the change _should_ shift the Nimbus output relative to GeoClaw.
   Update the rationale in this doc and bump the tolerance only if the
   new envelope is honestly justified by the underlying physics change.
3. If the test fails OUTSIDE the band, your change drifted further
   from GeoClaw than you intended. Investigate before merging.

The fixture JSON files are NOT regenerated automatically; they are the
ground truth. Update the Nimbus model OR the fixture, never both in the
same commit.

## Why GeoClaw runs offline only

The Tier 3 pipeline is offline / out-of-band on purpose. GeoClaw needs
gfortran + Python + ~50 MB of binary; bundling it would inflate the
shipping cost from ~2 MB to ~50 MB and force every Nimbus user to install
a Fortran toolchain. The committed JSON fixtures are the cheap-to-run
artefact users actually consume; they make the validation testable in
the regular `pnpm test` sweep without anyone needing GeoClaw locally.

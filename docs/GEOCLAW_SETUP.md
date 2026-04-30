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

Listed in [scenarios.json](../scripts/geoclaw/scenarios.json). Each
entry has the same input shape as the `geoclawComparison.test.ts`
fixture interface (`type`, source-class params, optional `domain` &
`probes`), so adding a new scenario is a JSON edit + one `python
run_scenario.py <id>` call.

Two groups:

**Named historical events** (one per source class, plus extras):

| Scenario          | Source                              | Reference                           |
| ----------------- | ----------------------------------- | ----------------------------------- |
| `tohoku-2011`     | Mw 9.1 megathrust, 700 km rupture   | DART 21413 peak 0.30 m at 1500 km   |
| `sumatra-2004`    | Mw 9.1 megathrust, 1300 km rupture  | Cocos Island 0.40 m at 1700 km      |
| `maule-2010`      | Mw 8.9 megathrust, 450 km rupture   | DART 32412 peak 0.13 m at 2050 km   |
| `cascadia-m9`     | Modelled Mw 9.0 megathrust scenario | Modelled DART benchmark             |
| `krakatau-1883`   | Volcanic flank collapse, 4 km³      | Anjer tide gauge 36 m run-up        |
| `storegga-8200bp` | Submarine landslide, 3000 km³       | Norwegian coast 10 m sediment scour |
| `eltanin-2.5ma`   | 1.5 km asteroid, 5 km Pacific basin | Geological "no crater" record       |

**Custom-input grid** (samples the parameter space the user can
configure in the app, so any user-picked source falls within a
validated parameter envelope):

| Scenario                      | Type      | Parameter          |
| ----------------------------- | --------- | ------------------ |
| `custom-seismic-mw75-l300km`  | Seismic   | Mw 7.5, L=300 km   |
| `custom-seismic-mw85-l700km`  | Seismic   | Mw 8.5, L=700 km   |
| `custom-seismic-mw95-l1500km` | Seismic   | Mw 9.5, L=1500 km  |
| `custom-volcanic-small`       | Volcanic  | V=0.1 km³ collapse |
| `custom-volcanic-large`       | Volcanic  | V=20 km³ collapse  |
| `custom-landslide-small`      | Landslide | V=50 km³           |
| `custom-landslide-large`      | Landslide | V=5000 km³         |
| `custom-impact-3km`           | Impact    | D=3 km, 4 km basin |

Smaller impactors (D < 1 km) produce cavities R_C < 6 km that need
sub-kilometre cells to fixture-pin properly. The
`eltanin-2.5ma` named fixture (1.5 km impactor) covers the upper
intermediate range; the 3 km custom-impact fixture covers the large
end. The Nimbus app pipeline computes amplitudes for D < 1 km too,
but a fixture-grade GeoClaw pin would need ~10–100× the per-scenario
compute time for the source to resolve on the AMR grid.

## Generating a fixture

The `scripts/geoclaw/` directory contains:

- `setrun_template.py` — generic GeoClaw `setrun()` that reads its
  parameters from a sidecar `_run_params.json` written per run.
- `run_scenario.py` — driver: looks the scenario up in `scenarios.json`,
  builds Okada dtopo (seismic) or Gaussian qinit (volcanic / landslide /
  impact), wires up topo, sets the probe gauges, runs `make .output`,
  parses the gauge files, and writes the fixture JSON.
- `scenarios.json` — per-scenario inputs (named historical events +
  custom-input grid covering the user-configurable parameter space).
- `_patch_tolerance.py` — re-writes every committed fixture's
  `_metadata.tolerance` to the per-source-class default in
  `run_scenario.py` (use after changing the tolerance table).
- `_batch_named.sh` / `_batch_qinit.sh` / `_batch_seismic.sh` /
  `_batch_custom.sh` — convenience wrappers that activate the venv and
  run a fixed list of scenarios.

```sh
# Activate the WSL2 venv, then per scenario:
source /root/clawenv/bin/activate
export CLAW=/root/clawpack-src
export FC=gfortran
cd /mnt/c/Users/.../Nimbus/scripts/geoclaw

python run_scenario.py tohoku-2011
# Runs in ~25 s and writes
#   ../../src/physics/validation/geoclawFixtures/tohoku-2011.json

# Or batch all 6 named scenarios:
bash _batch_named.sh

# Or all 10 custom-input grid points:
bash _batch_custom.sh
```

After (re-)generating fixtures:

```sh
cd ../..
pnpm test src/physics/validation/geoclawComparison
```

The comparator iterates over every JSON file in the fixtures directory,
so adding a new fixture requires no test-code change.

## Per-source-class tolerance

Tolerances live in `scripts/geoclaw/run_scenario.py`
(`DEFAULT_TOLERANCE_BY_TYPE`) and are mirrored into each fixture's
`_metadata.tolerance` field. Per-source-class because a 1D-radial
closed-form pipeline cannot match a 2D AMR shallow-water solver to the
same precision across every source geometry:

- `seismic-megathrust`: factor 3 (200 % error). Elongated ruptures
  (L/W=2 default) radiate strongly perpendicular to strike; Nimbus's
  isotropic 1D-radial cannot capture that azimuth dependence.
- `volcanic-collapse`: factor 5 (400 % error). Watts 2000 subaerial /
  caldera coefficient has factor-3 scatter against observations + the
  1D-radial vs 2D mismatch.
- `submarine-landslide`: factor 3 (200 %). Watts 2000 submarine
  coefficient is better constrained; 1D-radial geometric mismatch
  dominates.
- `impact-deep-ocean`: factor 5 (400 %). Ward-Asphaug cavity model has
  factor-3 scatter, plus the cavity collapse is a 3D phenomenon that
  neither 1D-radial nor 2D-AMR resolves at the source.

The Tier-3 pin catches order-of-magnitude regressions (NaN, sign flips,
missing physics), not precision-level discrepancies. Synolakis et al.
2008 §6 cites ±25-50 % spread between MOST/GeoClaw/COMCOT/Tsunami-HySEA
on the same NOAA benchmark — but those codes all do 2D AMR, so a 1D-
radial-vs-2D-AMR comparison genuinely needs wider pins.

## Re-running the suite after a model change

If you intentionally re-calibrate the closed-form pipeline (Sprint 1
Manning constants, Sprint 2 dispersion length, etc.):

1. Run `pnpm test src/physics/validation/geoclawComparison` first.
2. If the test fails inside the per-class tolerance band, the change
   _did_ shift Nimbus output relative to GeoClaw — investigate whether
   it's an intended improvement or an unintended drift.
3. If the test fails OUTSIDE the band, your change went further from
   GeoClaw than the per-class envelope allows. Either adjust the model
   or, if the new envelope is honestly justified by the physics change,
   bump the per-class tolerance in `run_scenario.py:DEFAULT_TOLERANCE_BY_TYPE`
   and re-run `_patch_tolerance.py` to update the committed fixtures.

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

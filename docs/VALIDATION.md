# Validation report

This page summarises the validation suite that compares Nimbus
simulator predictions against published observations of historical
events. Every assertion lives in [src/physics/validation/](../src/physics/validation/)
and runs as part of the regular `pnpm test` sweep — a regression in
any of these tables fails CI.

## Methodology

For each predicted quantity:

1. We pick the most-cited published observation (DART buoy arrival,
   USGS macroseismic survey, AVHRR plume height, etc.).
2. We document the observation's own ±1σ measurement uncertainty.
3. We compute the simulator prediction with the published nominal
   inputs.
4. We assert |predicted − observed| stays inside `(observation σ) +
(model envelope σ)`. The model envelope σ is the published
   model-side scatter (factor-2 for Mastin 2009 plumes, ±20 % for
   trans-oceanic Lamb 1932 celerity, and so on — each row below cites
   the source for the chosen envelope).

This is honest validation, not curve-fitting: the tolerance bands
are documented, sourced, and frozen in [fixtures.ts](../src/physics/validation/fixtures.ts).

## Tsunami arrival times

Far-field DART / tide-gauge records of the two best-instrumented
trans-oceanic tsunamis. The simulator's Lamb 1932 shallow-water
celerity over a 4 500 m mean depth is the same model the in-app
"arrives in X minutes" badge uses.

| Event        | Stations        | RMSE bound | Mean bias bound | Per-station tolerance       |
| ------------ | --------------- | ---------- | --------------- | --------------------------- |
| Tōhoku 2011  | 4 trans-Pacific | < 60 min   | < 40 min        | ±20 % of predicted + 3σ obs |
| Sumatra 2004 | 3 trans-Indian  | < 50 min   | (n/a)           | ±20 % of predicted + 3σ obs |

Sources: Rabinovich et al. 2013 (Pageoph 170); Rabinovich & Eblé 2015
(Pageoph 172).

## Earthquake MMI rings

Macroseismic-survey contour radii for moderate continental events.
The simulator's MMI VII radius is from Wald 1999 PGV-MMI + Boore 2014
NGA-West2 attenuation — the same stack USGS ShakeMap runs.

| Event           | Mw  | Depth | Observed MMI VII | Tolerance    | Source                             |
| --------------- | --- | ----- | ---------------- | ------------ | ---------------------------------- |
| Northridge 1994 | 6.7 | 18 km | 25 km            | ±8 km + 30 % | Wald et al. 1999 EQ Spectra Fig. 6 |
| L'Aquila 2009   | 6.3 | 9 km  | 15 km            | ±5 km + 30 % | Galli & Camassi 2009 INGV survey   |

Aggregate cross-event bias must stay within ±25 % — i.e. no systematic
factor-1.3 over- or under-prediction across the suite.

## Volcanic plume heights

Mastin 2009 fit `H = 2.0 · V̇^0.241`, with V̇ in m³/s of dense-rock-
equivalent magma. The Mastin envelope is factor-2 (±50 % of predicted),
which the validation tolerance includes.

| Event                | V̇ (m³/s DRE) | Observed H | Tolerance       | Source                             |
| -------------------- | ------------ | ---------- | --------------- | ---------------------------------- |
| Pinatubo 1991        | 1.7e5        | 35 km      | ±8 km + 50 % H  | Mastin 2009 Table 1 + Holasek 1996 |
| Mount St Helens 1980 | 5.0e4        | 25 km      | ±5 km + 50 % H  | Mastin 2009 Table 1 + Carey 1985   |
| Krakatau 1883        | 5.0e5        | 40 km      | ±10 km + 50 % H | Self & Rampino 1981 reconstruction |

## NOAA tsunami benchmark problems (Phase-20)

The NTHMP / Synolakis et al. 2008 benchmark suite is the standard
acceptance set used by every operational tsunami forecast code (MOST,
GeoClaw, COMCOT, Tsunami-HySEA). Pinning Nimbus output against these
references turns "the formula looks reasonable" into "the formula
matches the same number a NOAA-accepted solver would produce."

Tolerance bands:

- **±20 %** for analytic / laboratory benchmarks (BP1 Synolakis).
  Tighter pins are not justified by the model-spread envelope
  reported in Synolakis et al. 2008 §6.
- **±25 %** for seismic far-field benchmarks (DART buoys, tide
  gauges). Reflects the intrinsic single-station scatter from
  filtering choice + tidal de-trending + bottom-pressure-to-
  amplitude inversion (each ≈ ±10 %).

| Benchmark                                              | Reference           | Predicted                 | Observed | Error | Source                     |
| ------------------------------------------------------ | ------------------- | ------------------------- | -------- | ----- | -------------------------- |
| BP1 H/d=0.019 R/H, 1:19.85 plane beach                 | Synolakis 1987      | matches Carrier-Greenspan | 4.683    | < 1 % | Synolakis 1987 Table 1     |
| BP1 H/d=0.045                                          | Synolakis 1987      | matches                   | 5.815    | < 1 % | Synolakis 1987 Table 1     |
| BP1 H/d=0.075                                          | Synolakis 1987      | matches                   | 6.604    | < 1 % | Synolakis 1987 Table 1     |
| Sumatra 2004 amplitude at Cocos Island (1700 km)       | Bernard et al. 2006 | 0.49 m                    | 0.4 m    | 24 %  | Phil. Trans. R. Soc. A 364 |
| Tōhoku 2011 mean coseismic slip                        | Satake 2013         | inside [5,25] m           | ~10–20 m | ✓     | BSSA 103(2B): 1473         |
| **Tōhoku 2011 DART 21413 (1500 km, Phase-21c radial)** | Satake 2013         | 0.27 m                    | 0.30 m   | 10 %  | BSSA 103(2B), Fig. 6       |

### Tier 2 work-in-progress

The cylindrical 1D model (Phase-19 / Tier 1) systematically
over-predicts compact-rupture far-field amplitudes by a factor 3-7×
because peaked slip distributions (Tōhoku 2011: 8 m peak vs ~4 m
mean) inject high-frequency dispersion the closed-form
Heidarzadeh-Satake decay cannot capture. Closing this gap requires
a real Saint-Venant solver — the Tier 2 "Coastal Deep Dive" pipeline.

**Phase-21a + 21b — DONE.** Saint-Venant 1D solver lives at
[src/physics/tsunami/saintVenant1D.ts](../src/physics/tsunami/saintVenant1D.ts).
Two numerical schemes:

- `'muscl-rk2'` (default): MUSCL second-order TVD reconstruction
  (minmod limiter) + SSP-RK2 time stepping — same combination
  GeoClaw / COMCOT / MOST use for shallow water.
- `'hll-euler'`: first-order HLL + forward Euler — kept as
  regression diagnostic.

Phase-21b also fixed a hydrostatic-balanced wall boundary bug
discovered during the propagation validation: the Phase-21a wall
fluxes were `(0, 0)`, but the momentum-flux part needs to mirror
`½·g·h²` to cancel the interior pressure gradient at the boundary
cell. With the bug, a flat 4 km deep ocean at rest blew up within
~300 time steps. The regression test in `saintVenant1D.test.ts`
now pins the lake-at-rest invariant.

Validation suite (13 unit tests, all green):

- Stoker dam-break: mass conservation to FP precision (no friction);
  Ritter front speed within ±15 % of √(g·h_L); monotone solution.
- Lake-at-rest invariant: zero motion for 5000 s on a flat 4 km
  basin (regression for the wall-boundary bug).
- MUSCL+RK2 propagation: Gaussian source retains ≥ 40 % of the
  initial amplitude at 250 km after 2500 s of transit. The first-
  order HLL+Euler dropped to < 0.3 % — that is the dissipation gap
  Phase-21b closes.
- Defensive edge cases: under-sized grid, mismatched arrays,
  non-positive cell width / duration, all-dry domain, probe
  recording, bit-identical determinism.

**Phase-21c — DONE.** 1D-radial geometry (`-h·u/r` source term)
added so the solver propagates in 2D-cylindrical mode for seismic
tsunami pins. Symmetry axis at the left boundary; the wall
hydrostatic-balance fix from Phase-21b carries over. Three new
invariant tests pin the radial behaviour:

- amplitude decays roughly as 1/√r (Lamb 1932 long-wave radial limit)
- radial peak < cartesian peak at the same probe distance
  (geometric energy spread)
- lake-at-rest invariant in radial mode

**Tōhoku DART 21413 amplitude pinned within ±25 %.** The end-to-end
recipe used by the validation test:

1. Source: Gaussian sea-surface displacement centred at the axis,
   peak η₀ = 4 m × WAVE_COUPLING_EFFICIENCY (= 2.8 m, the Satake
   2013 Tōhoku DART calibration), half-width 350 km (rupture
   half-length).
2. Solver: MUSCL+RK2 1D-radial, Manning n = 0.025, run for 9 000 s.
3. Post-process: multiply the solver peak amplitude at the buoy
   distance by the Heidarzadeh & Satake 2015 dispersion factor
   `exp(-r/2500 km)` to account for HF spectral spreading the
   non-dispersive shallow-water solver does not model.

Result: 0.27 m predicted vs 0.30 m observed, error 10 % — well
inside the ±25 % seismic-pin envelope. The Tier-2 todo from
Phase-20 is now closed.

**Phase-21d — TODO.** Web Worker integration via Comlink + lazy
loading + UI Deep Dive mode (wave-height vs distance chart +
run-up profile).

## Tier 3 — GeoClaw fixture comparison (Sprint 3)

The Tier-3 pin commits a JSON fixture per scenario in
[src/physics/validation/geoclawFixtures/](../src/physics/validation/geoclawFixtures/)
recording GeoClaw's amplitude at each probe.
[geoclawComparison.test.ts](../src/physics/validation/geoclawComparison.test.ts)
feeds the same input to the Nimbus closed-form / Saint-Venant 1D-radial
pipeline and asserts that the predicted amplitude lands within the
per-source-class tolerance documented in
`scripts/geoclaw/run_scenario.py:DEFAULT_TOLERANCE_BY_TYPE`. The
comparator iterates over every JSON file in the directory — adding a
new fixture requires no test-code change.

The tolerance bands reflect the inherent scatter between Nimbus's
closed-form pipeline and a 2D AMR shallow-water solver; the Tier-3 pin
catches order-of-magnitude regressions (NaN, sign flips, missing
physics), not precision-level discrepancies. Synolakis et al. 2008 §6
cites ±25–50 % spread between MOST/GeoClaw/COMCOT/Tsunami-HySEA on the
same NOAA benchmark — but those codes all do 2D AMR. A 1D-radial vs
2D-AMR comparison has wider scatter, especially for elongated ruptures
where Nimbus's isotropic propagation cannot match GeoClaw's directional
radiation pattern.

Per-class tolerances:

| Source class           | Tolerance | Why                                                                                                                                                |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seismic-megathrust`   | factor 3  | L/W = 2 default produces strong directional radiation in 2D AMR; Nimbus 1D-radial is isotropic. Probe azimuth relative to strike drives ±2-3× scatter. |
| `volcanic-collapse`    | factor 5  | Watts 2000 subaerial / caldera coefficient has factor-3 scatter against observations, plus 1D-radial vs 2D mismatch.                               |
| `submarine-landslide`  | factor 3  | Watts 2000 submarine coefficient is better constrained; 1D-radial geometric mismatch dominates the residual scatter.                               |
| `impact-deep-ocean`    | factor 5  | Ward-Asphaug cavity model has factor-3 scatter; cavity collapse is a 3D phenomenon that neither 1D-radial nor 2D-AMR shallow water resolves.       |

Setup: see [docs/GEOCLAW_SETUP.md](GEOCLAW_SETUP.md). Generating new
fixtures requires WSL2 / Linux + gfortran + Python clawpack (~30 min
one-time install + ~1-30 s per scenario). Committed JSON fixtures
make the validation testable in the regular `pnpm test` sweep without
anyone needing GeoClaw locally.

Coverage today (named historical events):

| Fixture                  | Source                       | Probe-distance range | Tolerance        |
| ------------------------ | ---------------------------- | -------------------- | ---------------- |
| `tohoku-2011`            | Mw 9.1 megathrust, 700 km    | 1235 km              | factor 3 (200 %) |
| `sumatra-2004`           | Mw 9.1 megathrust, 1300 km   | 2038–2300 km         | factor 3         |
| `cascadia-m9`            | Mw 9.0 megathrust, 1100 km   | 1000 km × 2          | factor 3         |
| `maule-2010`             | Mw 8.92 megathrust, 450 km   | 2050 km              | factor 3         |
| `krakatau-1883`          | Volcanic caldera, 4 km³      | 61–154 km            | factor 5         |
| `storegga-8200bp`        | Submarine landslide, 3000 km³ | 580–950 km          | factor 3         |
| `eltanin-2.5ma`          | 1500 m asteroid, 5 km basin  | 500–1000 km          | factor 5         |

Coverage today (custom-input grid — sampling the parameter space the
user can configure in the app, so any user-picked source falls within
a validated envelope):

| Fixture                          | Type     | Parameter              |
| -------------------------------- | -------- | ---------------------- |
| `custom-seismic-mw75-l300km`     | Seismic  | Mw 7.5, L=300 km       |
| `custom-seismic-mw85-l700km`     | Seismic  | Mw 8.5, L=700 km       |
| `custom-seismic-mw95-l1500km`    | Seismic  | Mw 9.5, L=1500 km      |
| `custom-volcanic-small`          | Volcanic | V=0.1 km³              |
| `custom-volcanic-large`          | Volcanic | V=20 km³               |
| `custom-landslide-small`         | Landslide| V=50 km³               |
| `custom-landslide-large`         | Landslide| V=5000 km³             |
| `custom-impact-3km`              | Impact   | D=3 km (R_C=18 km)     |

**Resolution-limited cases.** Impact scenarios with impactor diameter
< 1 km produce cavities R_C < 6 km that cannot be resolved on the
typical 0.5–1° fixture grid (cells 55–110 km wide). The Gaussian source
averages out to numerical zero on the GeoClaw side while Nimbus retains
the original peak — making the comparison meaningless. The custom-input
grid deliberately omits sub-resolution cases (no `custom-impact-100m`,
no `custom-impact-500m`); the real Nimbus app pipeline still computes
those scenarios, but a fixture-grade GeoClaw reference would need
~10–100× the compute time of the larger-source fixtures.
The `eltanin-2.5ma` named fixture (1.5 km impactor) covers the upper
intermediate range; `custom-impact-3km` (R_C=18 km) covers the large
end. Probes that drop below 1 cm in any fixture (the GeoClaw
dry-tolerance noise floor) are reported as `it.skip` rather than fail.

| Benchmark                                  | Status    | Notes                                                                    |
| ------------------------------------------ | --------- | ------------------------------------------------------------------------ |
| Tōhoku 2011 DART 21413 amplitude (1500 km) | ✅ Pinned | Saint-Venant 1D-radial + Heidarzadeh-Satake dispersion, ±25 % envelope   |
| BP2 (conical island), BP4 (Hilo Bay)       | Future 2D | Need a 2D focusing/refraction-aware solver; not in scope popular-science |

## Tunguska energy budget

| Quantity            | Window    | Source                                |
| ------------------- | --------- | ------------------------------------- |
| Reconstructed yield | 3 – 30 Mt | Boslough & Crawford 2008 + Chyba 1993 |

The preset's kinetic energy must lie inside the literature envelope.
Anything outside means either the preset has drifted (an input edit)
or the kinetic-energy formula has been silently changed.

## Reproducing the validation suite

```bash
pnpm test src/physics/validation
```

Runs in well under 5 seconds; no external network access. Adding a
new fixture is documented in [fixtures.ts](../src/physics/validation/fixtures.ts):
provide the observation, its ±1σ, the source DOI, and the model-side
envelope. The corresponding test file calls the relevant simulator
entry point and asserts inclusion in the tolerance band.

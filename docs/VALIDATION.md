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

| Benchmark                                        | Reference           | Predicted                 | Observed | Error | Source                     |
| ------------------------------------------------ | ------------------- | ------------------------- | -------- | ----- | -------------------------- |
| BP1 H/d=0.019 R/H, 1:19.85 plane beach           | Synolakis 1987      | matches Carrier-Greenspan | 4.683    | < 1 % | Synolakis 1987 Table 1     |
| BP1 H/d=0.045                                    | Synolakis 1987      | matches                   | 5.815    | < 1 % | Synolakis 1987 Table 1     |
| BP1 H/d=0.075                                    | Synolakis 1987      | matches                   | 6.604    | < 1 % | Synolakis 1987 Table 1     |
| Sumatra 2004 amplitude at Cocos Island (1700 km) | Bernard et al. 2006 | 0.49 m                    | 0.4 m    | 24 %  | Phil. Trans. R. Soc. A 364 |
| Tōhoku 2011 mean coseismic slip                  | Satake 2013         | inside [5,25] m           | ~10–20 m | ✓     | BSSA 103(2B): 1473         |

### Tier 2 work-in-progress

The cylindrical 1D model (Phase-19 / Tier 1) systematically
over-predicts compact-rupture far-field amplitudes by a factor 3-7×
because peaked slip distributions (Tōhoku 2011: 8 m peak vs ~4 m
mean) inject high-frequency dispersion the closed-form
Heidarzadeh-Satake decay cannot capture. Closing this gap requires
a real Saint-Venant solver — the Tier 2 "Coastal Deep Dive" pipeline.

**Phase-21a — DONE.** Saint-Venant 1D HLL first-order solver lives at
[src/physics/tsunami/saintVenant1D.ts](../src/physics/tsunami/saintVenant1D.ts).
Validated against the Stoker dam-break (mass conservation to FP
precision, Ritter front speed within ±15 %, monotone TVD profile).
**Cannot pin Tōhoku DART yet** because HLL first-order has too much
numerical dissipation for long-distance wave propagation: a Gaussian
source seeded at the rupture loses ~95 % of its peak amplitude over
the first 200 km of transit, far faster than physical (or GeoClaw's
second-order MUSCL HLLC reconstruction). The solver is the foundation
for Phase-21b; the Tōhoku pin will land then.

**Phase-21b — TODO.** MUSCL second-order TVD reconstruction (slope
limiter on the cell-interface states). Reduces HLL numerical
dissipation by an order of magnitude and is what GeoClaw / COMCOT /
MOST all use. After this lands, Tōhoku DART 21413 amplitude can be
pinned to ±25 % in the Saint-Venant pipeline.

**Phase-21c — TODO.** Web Worker integration via Comlink + lazy
loading, so the solver runs off-main-thread when the user clicks
"Coastal Deep Dive" in the report panel. Default UX unchanged.

**Phase-21d — TODO.** UI: Deep Dive mode with wave-height vs distance
chart + run-up profile.

| Benchmark                                  | Status    | Blocker / Planned solver                                                 |
| ------------------------------------------ | --------- | ------------------------------------------------------------------------ |
| Tōhoku 2011 DART 21413 amplitude (1500 km) | Phase-21b | Needs MUSCL second-order reconstruction; HLL first-order too dissipative |
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

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

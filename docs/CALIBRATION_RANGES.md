# Calibration ranges per formula

Every quantity the simulator displays comes from a peer-reviewed
formula calibrated against a finite window of input parameters. When
a custom user input falls _outside_ that window, the formula still
returns a number — but the confidence in that number is
significantly lower than when the input sits inside the calibrated
band. This document tabulates the windows so an external reviewer
(or a careful user) can answer "is this prediction trustworthy?"
without reading the source.

The runtime [validityWarnings](../src/physics/inputValidity.ts)
module emits warnings for the most consequential out-of-band cases;
the table below is the editorial reference behind the runtime checks.

## Impact

| Input                      | Calibration window  | Source                                                       | Behaviour outside                                                                                                             |
| -------------------------- | ------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Impactor diameter          | 1 m – 30 km         | Collins et al. 2005 hydrocode + Schmidt-Housen 1987 lab data | < 1 m: strength-dominated regime, formula over-predicts crater. > 30 km: planet-scale curvature breaks local-flat assumption. |
| Impact velocity            | 3 – 80 km/s         | Collins 2005 hypervelocity regime                            | < 3 km/s: subsonic, formula over-predicts. > 80 km/s: shock compression dominates, π-group breaks down.                       |
| Impact angle               | 5° – 90°            | Pierazzo & Melosh asymmetry envelope                         | < 5°: extreme grazing, "skip-out" regime not modelled.                                                                        |
| Water depth (ocean impact) | ≥ impactor diameter | Ward & Asphaug 2000 cavity assumption                        | h < L: shallow-water cavity model unreliable.                                                                                 |
| Target density             | 1 500 – 3 500 kg/m³ | Collins 2005 competent-rock targets                          | Outside: ice/sediment/iron targets need separate scaling.                                                                     |

## Explosion

| Input                       | Calibration window             | Source                                             | Behaviour outside                                                                         |
| --------------------------- | ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Yield                       | 1 ton – 200 Mt                 | Glasstone 1977 + Kinney-Graham 1985 + Sublette FAQ | < 1 ton: chemical-explosive regime. > 200 Mt: hypothetical, beyond instrumented envelope. |
| Height of burst             | 0 – 50 km                      | Glasstone Fig 3.74 / Brode 1968                    | > 50 km: HEMP regime, surface blast/thermal lose physical meaning.                        |
| Burst regime classification | scaled-z 0 – 1 500 m·kt^(−1/3) | hobBlastFactor piecewise fit                       | Beyond 1 500: stratospheric, blast factor collapses to 0.25× by extrapolation.            |

## Earthquake

| Input               | Calibration window                          | Source                                         | Behaviour outside                                                                                |
| ------------------- | ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Moment magnitude Mw | 4.0 – 9.5                                   | Wells & Coppersmith 1994 + Hanks-Kanamori 1979 | < 4: microseismic regime, no useful damage radii. > 9.5: above Valdivia 1960 (largest recorded). |
| Hypocentre depth    | 0 – 100 km                                  | Boore 2014 NGA-West2 + subduction extension    | > 100 km: deep-focus regime, path effects dominate ground-motion attenuation.                    |
| Fault type          | reverse / normal / strike-slip / megathrust | W&C taxonomy                                   | Other types fall through to "all" (continental reverse) coefficients.                            |

## Volcano

| Input                  | Calibration window                                  | Source                             | Behaviour outside                                                                                         |
| ---------------------- | --------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Volume eruption rate V̇ | 1 m³/s – 10⁸ m³/s                                   | Mastin et al. 2009 Table 1         | < 1: lava-fountain regime, plume model assumes buoyant ascent. > 10⁸: above the largest observed Plinian. |
| Total ejecta volume V  | 0 – 10¹³ m³ (VEI ≤ 8)                               | Newhall & Self 1982 VEI scale      | > 10¹³: beyond Quaternary supereruptions.                                                                 |
| Ashfall isopach        | calibrated against MSH/Pinatubo/Krakatau (1-20 km³) | Pyle 1989 + Bonadonna & Costa 2013 | Outside: the K=60 000 prefactor was fit to historical Plinian eruptions.                                  |

## Landslide

| Input            | Calibration window                   | Source                          | Behaviour outside                                                           |
| ---------------- | ------------------------------------ | ------------------------------- | --------------------------------------------------------------------------- |
| Slide volume     | 10⁶ – 10¹³ m³                        | Watts 2000 + Murty 2003         | > 10¹³: beyond Storegga, the largest documented submarine slide.            |
| Slope angle      | 1° – 80°                             | Watts 2000 solid-block geometry | Outside: extreme cases violate the rigid-block geometry assumption.         |
| Mean ocean depth | ≥ 10 m                               | Saturation cap 0.4·depth        | < 10 m: amplitude saturated by depth cap; result mostly noise.              |
| Regime           | subaerial (rigid) / submarine (soft) | Two-prefactor Phase 9 fit       | Mis-classifying drives a ~80× error (K_subaerial=0.4 vs K_submarine=0.005). |

## Tsunami propagation

| Quantity                  | Calibration window                      | Source                        | Behaviour outside                                                          |
| ------------------------- | --------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| FMM eikonal arrival times | grid spacing ≥ 5 km, ocean depth ≥ 10 m | Sethian 1996 first-order FMM  | Coarser grids over-predict due to diagonal anisotropy bias (~12 % at 45°). |
| Green's law shoaling      | h ≥ 10 m, factor capped at 4×           | McCowan 1894 wave-breaking    | Beyond cap: wave breaks at source, linear theory invalid.                  |
| Synolakis 1987 runup      | A ≪ d, beach slope 1:2 to 1:2000        | Synolakis 1987 J. Fluid Mech. | Outside: nonlinear inundation regime, Boussinesq solver required.          |

## Cascade timeline

| Stage tier                   | Calibration               | Source                          | Caveat                                                   |
| ---------------------------- | ------------------------- | ------------------------------- | -------------------------------------------------------- |
| Immediate (< 1 min)          | physical onsets are exact | per-stage formula               | OK — these are the simulator's primary output.           |
| Short-term (1 min – 1 day)   | analytical                | Glasstone / Reasenberg          | OK.                                                      |
| Medium-term (1 day – 1 year) | order-of-magnitude only   | Robock 2000 / IPCC AR6          | Documented in Limitations: descriptive, not predictive.  |
| Long-term (≥ 1 year)         | order-of-magnitude only   | Schulte 2010 K-Pg / Toohey 2017 | Idem — climate cascade beyond first year is qualitative. |

## How the runtime guards work

`validateXxxInputs(input)` returns a list of `ValidityWarning` objects
when a parameter exceeds the calibration window. The UI panel can
surface these as a "⚠ extrapolating" badge next to the affected
output value. Severity tiers:

- **info** — value is borderline but inside the published scatter envelope.
- **warning** — at the edge of the calibration window; results have
  reduced confidence.
- **extrapolation** — outside the calibration window; results are
  formally undefined and should be marked as such in the report.

Run the full preset audit at any time with:

```bash
pnpm audit:phase10
```

Re-run after physics edits to verify nothing has drifted out of
its literature window.

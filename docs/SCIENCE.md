# Scientific bibliography & formula rules

Every number rendered in the UI traces back to a published formula
listed below. Every physics function in `src/physics/` carries a
JSDoc citation with authors, year, source, and the equation number
used.

## Rules for new physics code

1. **Cite the source.** Authors, year, short title, DOI or stable
   URL, and the equation number used.
2. **Test against a published value.** A unit test reproduces a
   documented empirical or model-derived value within ±5%. If the
   source itself has wider uncertainty, widen the tolerance and say
   why in a comment.
3. **Brand inputs and outputs.** Raw `number` is rejected by the
   compiler at physics boundaries — use the types from
   [src/physics/units.ts](../src/physics/units.ts).
4. **No magic numbers.** Constants live in `src/physics/constants.ts`
   with a source line. Inline literals are reserved for dimensionless
   coefficients lifted from a specific equation, with the equation
   number in the comment.
5. **Deterministic.** No `Math.random` inside formulas. Accept a
   PRNG seed if stochasticity is genuinely needed.
6. **Document tolerances.** A test comment explains why the
   tolerance was chosen ("Collins+05 reports ±10% on transient
   crater radius").

## Core references

### Impacts

- **Collins, G. S., Melosh, H. J., & Marcus, R. A. (2005).** _Earth
  Impact Effects Program._ Meteoritics & Planetary Science 40(6),
  817–840. DOI: [10.1111/j.1945-5100.2005.tb00157.x](https://doi.org/10.1111/j.1945-5100.2005.tb00157.x).
  Energy, crater diameter (simple + complex), seismic magnitude,
  thermal radiation, ejecta.
- **Melosh, H. J. (1989).** _Impact Cratering: A Geologic Process._
  Oxford University Press. Foundational reference for crater
  morphology.
- **Pike, R. J. (1980).** _Control of crater morphology by gravity
  and target type: Mars, Earth, Moon._ Proc. LPSC 11, 2159–2189.
  Depth-to-diameter ratio for complex craters.

### Nuclear and conventional explosions

- **Glasstone, S., & Dolan, P. J. (1977).** _The Effects of Nuclear
  Weapons_ (3rd ed.). U.S. DoD/DoE. Overpressure scaling, thermal
  fluence, fireball radius, airburst vs groundburst.
- **Brode, H. L. (1968).** _Review of Nuclear Weapons Effects._
  Annual Review of Nuclear Science 18, 153–202. Semi-empirical
  blast-wave relations.
- **Kinney, G. F., & Graham, K. J. (1985).** _Explosive Shocks in
  Air_ (2nd ed.). Springer. Conventional-explosive overpressure
  scaling.

### Tsunamis

- **Ward, S. N., & Asphaug, E. (2000).** _Asteroid impact tsunami: a
  probabilistic hazard assessment._ Icarus 145, 64–78. DOI:
  [10.1006/icar.1999.6336](https://doi.org/10.1006/icar.1999.6336).
- **Watts, P. (2000).** _Tsunami Features of Solid Block Underwater
  Landslides._ J. Waterway Port Coastal Ocean Eng. 126(3), 144–152.
  Submarine-landslide source.
- **Satake, K., & Atwater, B. F. (2007).** _Long-term perspectives on
  giant earthquakes and tsunamis at subduction zones._ Annual Review
  of Earth and Planetary Sciences 35, 349–374.
- **Synolakis, C. E. (1987).** _The runup of solitary waves._
  J. Fluid Mech. 185, 523–545. Coastal run-up.
- **Lamb, H. (1932).** _Hydrodynamics_ (6th ed.). CUP. Long-wave
  phase speed, §170.

### Earthquakes

- **Wald, D. J., Quitoriano, V., Heaton, T. H., & Kanamori, H.
  (1999).** _Relationships between PGA, PGV, and MMI in California._
  Earthquake Spectra 15(3), 557–564. Underlies USGS ShakeMap.
- **Boore, D. M., Stewart, J. P., Seyhan, E., & Atkinson, G. M.
  (2014).** _NGA-West2 Equations for Predicting PGA, PGV, and 5%-
  Damped PSA._ Earthquake Spectra 30(3), 1057–1085.
- **Hanks, T. C., & Kanamori, H. (1979).** _A moment magnitude
  scale._ JGR 84(B5), 2348–2350.
- **Wells, D. L., & Coppersmith, K. J. (1994).** _New empirical
  relationships among magnitude, rupture length, rupture width,
  rupture area, and surface displacement._ BSSA 84, 974–1002.
- **Reasenberg, P. A., & Jones, L. M. (1989).** _Earthquake hazard
  after a mainshock in California._ Science 243, 1173–1176.
  Aftershock sequence model.

### Volcanic eruptions

- **Mastin, L. G., et al. (2009).** _A multidisciplinary effort to
  assign realistic source parameters to models of volcanic ash-cloud
  transport and dispersion during eruptions._ JVGR 186, 10–21. DOI:
  [10.1016/j.jvolgeores.2009.01.008](https://doi.org/10.1016/j.jvolgeores.2009.01.008).
  Plume height as a function of mass eruption rate.
- **Newhall, C. G., & Self, S. (1982).** _The Volcanic Explosivity
  Index (VEI)._ JGR 87(C2), 1231–1238.
- **Glicken, H. (1996).** _Rockslide-debris avalanche of May 18,
  1980, Mount St. Helens Volcano, Washington._ USGS Open-File Report
  96-677. Lateral-blast wedge.

### Constants

- **CODATA 2018** — fundamental constants.
- **IAU 2015** — nominal solar / planetary values.
- **IUGG GRS80 / IERS** — Earth radius and mass.
- **UNESCO/IOC 1981** — seawater density.
- **Turcotte & Schubert, _Geodynamics_ (2nd ed., 2002)** — crustal
  density.
- **U.S. Standard Atmosphere 1976 (NOAA-S/T 76-1562)** — atmospheric
  profile.

## Validation values

Benchmark values that physics tests should reproduce. Extend as
formulas are added.

| Event            | Quantity         | Reference value | Source                    |
| ---------------- | ---------------- | --------------- | ------------------------- |
| Chicxulub impact | Kinetic energy   | ~4.2e23 J       | Schulte et al. 2010       |
| Tunguska 1908    | Equivalent yield | ~10–15 Mt TNT   | Boslough & Crawford 2008  |
| Hiroshima        | Yield            | ~15 kt TNT      | Glasstone & Dolan 1977    |
| Tsar Bomba       | Yield            | ~50 Mt TNT      | Khariton et al. 1996      |
| Krakatau 1883    | VEI              | 6               | Self & Rampino 1981       |
| Tōhoku 2011      | Moment magnitude | 9.1 Mw          | USGS                      |
| Tōhoku 2011      | Source amplitude | 4–10 m          | Satake et al. 2013 (DART) |

## Master formula table

The single source of truth for every quantity rendered to the user.
Each row links the UI label to the implementing file, the canonical
equation, the citation, and the declared 1σ scatter (used both by
{@link src/physics/confidence.ts} for static bands and by the Monte
Carlo wrappers for sampled inputs).

| UI quantity               | File                                | Formula                                             | Source                            | 1σ        |
| ------------------------- | ----------------------------------- | --------------------------------------------------- | --------------------------------- | --------- |
| Impactor kinetic energy   | events/impact/kinetic.ts            | E = ½ m v²                                          | Newtonian                         | inputs    |
| Transient crater Ø        | events/impact/crater.ts             | D_tc = 1.161 (ρi/ρt)^⅓ L^0.78 v^0.44 g^-0.22 sinθ^⅓ | Collins et al. 2005, Eq. 21       | ±10%      |
| Final crater Ø (simple)   | events/impact/crater.ts             | D = 1.25 D_tc                                       | Collins et al. 2005, Eq. 22       | ±5%       |
| Final crater Ø (complex)  | events/impact/crater.ts             | D = 1.17 D_tc^1.13 D_c^-0.13                        | Collins et al. 2005, Eq. 27       | ±10%      |
| Crater depth (simple)     | events/impact/crater.ts             | d = 0.196 D                                         | Pike 1980, Table III              | ±30%      |
| Crater depth (complex)    | events/impact/crater.ts             | d = 1.044 D^0.301                                   | Pike 1980, Table III              | ±30%      |
| Seismic Mw from impact    | events/impact/seismic.ts            | Mw ≈ 0.67 log₁₀ E - 5.87                            | Schultz & Gault 1975              | ±0.3 Mw   |
| Seismic moment Mw → M₀    | events/earthquake/seismicMoment.ts  | M₀ = 10^(1.5 Mw + 9.1) N·m                          | Hanks & Kanamori 1979             | ±0.1 Mw   |
| MMI from PGV              | events/earthquake/mmi.ts            | MMI = 3.78 + 1.47 log₁₀(PGV)                        | Wald et al. 1999                  | ±0.5 MMI  |
| Rupture area from Mw      | events/earthquake/rupture.ts        | A = 10^(Mw - 4.0)                                   | Wells & Coppersmith 1994          | ±0.3 dec  |
| Aftershock rate (Omori)   | events/earthquake/aftershocks.ts    | n(t) = K (t + c)^-p                                 | Reasenberg & Jones 1989           | ±factor 2 |
| Plume height              | events/volcano/plumeHeight.ts       | H = 2.0 V̇^0.241                                     | Mastin et al. 2009                | ±50%      |
| VEI ↔ ejecta volume       | events/volcano/vei.ts               | VEI = log₁₀(V) - 4 (V in m³)                        | Newhall & Self 1982               | discrete  |
| Ashfall isopach           | events/volcano/ashfall.ts           | Suzuki 1983 column + Ganser 1993 fallout            | Bonadonna & Phillips 2003         | ±factor 2 |
| Pyroclastic runout        | events/volcano/pyroclasticRunout.ts | r = 8.97 V^0.40                                     | Sheridan 1979 / Dade & Huppert 98 | ±70%      |
| Lateral-blast wedge       | events/volcano/extendedEffects.ts   | Glicken 1996 directed-blast                         | Glicken 1996                      | ±50%      |
| Overpressure ring         | events/explosion/overpressure.ts    | P = f(W, R/W^⅓) Sadovsky                            | Glasstone & Dolan 1977            | ±15%      |
| Thermal fluence           | events/explosion/thermal.ts         | Q = η Y / (4π R²) τ_atm                             | Glasstone & Dolan 1977            | ±25%      |
| Firestorm ignition radius | events/explosion/firestorm.ts       | R s.t. Q(R) = 4.19e5 J/m²                           | Glasstone & Dolan §7.40           | ±30%      |
| Tsunami cavity radius     | events/tsunami/impact.ts            | R_C = (3 E / 2π ρ g)^¼                              | Ward & Asphaug 2000, Eq. 3        | ±30%      |
| Tsunami far-field amp.    | events/tsunami/impact.ts            | A(r) = A₀ R_C / r · damping(r)                      | Ward & Asphaug + Wünnemann 2007   | ±factor 3 |
| Tsunami arrival time      | tsunami/fastMarching.ts             | eikonal `\|∇T\|² = 1/c²`, c = √(gh)                 | Sethian 1996                      | ±15%      |
| Tsunami shoaling          | events/tsunami/propagation.ts       | A_s = A_d (h_d / h_s)^¼                             | Green 1838                        | ±25%      |
| Tsunami runup             | tsunami/coastalSlope.ts             | R / A = 2.831 (cot β)^½ (A/h)^¼                     | Synolakis 1987                    | ±30%      |
| Submarine landslide tsun. | events/landslide/tsunami.ts         | Watts 2000 solid-block source                       | Watts 2000                        | ±factor 2 |
| Atmospheric profile       | atmosphere/ussa1976.ts              | U.S. Standard Atmosphere 1976                       | NOAA-S/T 76-1562                  | ±5%       |

**How to read the σ column.** Where σ is given as a percent it is the
half-range of a symmetric 1σ Gaussian (or log-Gaussian) on the value;
"factor-N" means the high-side bound is N× the value (corresponding
σ_log = ln N). The σ column is the **published** scatter — propagation
through the cascade is in `src/physics/uq/` (see Phase 3 of the
[scientific-defensibility roadmap](./ROADMAP.md)).

## When the science is contested

Some quantities have legitimately broad uncertainty in the
literature (Chicxulub impactor diameter is anywhere from 10 to 14 km
depending on the study). In those cases:

1. Pick the most widely cited value.
2. Document the uncertainty in the JSDoc.
3. Widen the test tolerance and explain why.
4. If two formulas disagree by more than the tolerance, file an
   issue and discuss before picking one.

Better to surface uncertainty than pretend it isn't there. A
popular-science audience deserves "we know this to ±30%", not a fake
two-decimal-place precision.

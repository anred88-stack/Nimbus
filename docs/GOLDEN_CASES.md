# Golden cases

Canonical scenarios used as oracles. Each is reproducible via `pnpm simulate` and pinned in tests.

## Pure-math oracles (analytic, ±5%)

| ID            | Test                         | Why golden                                           |
| ------------- | ---------------------------- | ---------------------------------------------------- |
| **G-SYN-019** | Synolakis 1987 BP1 H/d=0.019 | Carrier-Greenspan analytic R/H=4.683; NTHMP-accepted |
| **G-SYN-045** | Synolakis 1987 BP1 H/d=0.045 | R/H=5.815                                            |
| **G-SYN-075** | Synolakis 1987 BP1 H/d=0.075 | R/H=6.604                                            |
| **G-HK**      | Hanks-Kanamori M0(Mw=9.1)    | M0 = 5.0 × 10²² Nm exact; pure log identity          |

## Engineering scaling-law anchors (±20%)

| ID                    | Event                           | Observation                                  | Citation                           |
| --------------------- | ------------------------------- | -------------------------------------------- | ---------------------------------- |
| **G-TOH-DART**        | Tōhoku 2011 DART 21413          | 0.30 m at 1500 km                            | Satake 2013 BSSA 103(2B):1473      |
| **G-SUM-COCOS**       | Sumatra 2004 Cocos              | 0.40 m deep-water at 1700 km                 | Bernard 2006 PTRSA 364             |
| **G-MAULE-DART**      | Maule 2010 DART 32412           | 0.13 m at 2050 km                            | NOAA NCTR 2010-02-27               |
| **G-PINATUBO-PLUME**  | Pinatubo 1991 plume             | 35 km column from V̇=1.7e5 m³/s DRE           | Mastin 2009 + Holasek 1996         |
| **G-MTSH-PLUME**      | Mt St Helens 1980 plume         | 25 km from V̇=5e4 m³/s DRE                    | Carey & Sigurdsson 1985            |
| **G-NORTHRIDGE-MMI7** | Northridge 1994 MMI VII radius  | 25 km @ depth 18 km, Mw 6.7                  | Wald et al. 1999 EQ Spectra Fig.6  |
| **G-LAQUILA-MMI7**    | L'Aquila 2009 MMI VII           | 15 km @ depth 9 km, Mw 6.3                   | Galli & Camassi 2009 INGV          |
| **G-CHICX-CRATER**    | Chicxulub final crater Ø        | 180 km observed                              | Hildebrand 1991, Morgan 2016       |
| **G-METEOR-CRATER**   | Meteor Crater Ø                 | 1.2 km, intact iron impactor                 | Kring 2007                         |
| **G-TUNGUSKA-YIELD**  | Tunguska reconstructed yield    | 3-30 Mt envelope                             | Boslough 2008 + Chyba 1993         |
| **G-CHEL-AIRBURST**   | Chelyabinsk 2013 burst altitude | ~27 km observed (model gives ~22, ±factor 2) | Popova 2013 Science 342            |
| **G-CASTLE-BRAVO**    | Castle Bravo 1954 5 psi         | ~21 km @ 15 Mt surface burst on coral        | Sublette FAQ + Glasstone Fig.3.74a |
| **G-HIROSHIMA-FB**    | Hiroshima 1945 5 psi            | ~1.7 km @ 15 kt @ 580 m HOB                  | Glasstone Fig.3.74a                |
| **G-STARFISH-HEMP**   | Starfish Prime 1962 HEMP        | 50 kV/m saturation, ~2300 km disc            | IEC 61000-2-9                      |

## GeoClaw fixture anchors (factor 3-5 per source class)

15 committed fixtures in `src/physics/validation/geoclawFixtures/` cover 4 source classes × 7 named historical events + 8 custom-grid samples. See `docs/VALIDATION.md` Tier 3 section for the table. Each is reproducible via `pnpm geoclaw run <id>` (WSL2-only).

## Property-based / metamorphic anchors

| ID               | Property                                                                | Test                            |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------- |
| **P-MONO-YIELD** | yield ↑ → all blast/thermal radii ↑ for fixed HOB regime                | `monotonicity.property.test.ts` |
| **P-MONO-MW**    | Mw ↑ → seismicMoment ↑ → meanSlip × area ≈ const                        | `monotonicity.property.test.ts` |
| **P-MONO-VEI**   | volumeEruptionRate ↑ → plume ↑ (Mastin 2009)                            | `monotonicity.property.test.ts` |
| **P-MONO-VOL**   | collapseVolumeM3 ↑ → tsunami source amp ↑ (Watts)                       | `monotonicity.property.test.ts` |
| **P-MONO-KE**    | kineticEnergy ↑ → cavityRadius ↑ (Ward-Asphaug)                         | `monotonicity.property.test.ts` |
| **P-INV-AZ**     | rotating azimuth by 360° gives identical output                         | `geometry.crs.test.ts`          |
| **P-INV-LL**     | swapping (lat, lon) → result is wildly different (catches the swap bug) | `geometry.crs.test.ts`          |
| **P-INV-AM**     | a circle centred at lon=179° spanning lon=180° is split per RFC 7946    | `geometry.crs.test.ts`          |

## Historical regression anchors

See `docs/BUG_REGISTRY.md` — every fixed bug is one named test in `regressionRegistry.test.ts`.

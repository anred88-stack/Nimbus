/**
 * Centralized tolerance constants for the V&V suite.
 *
 * Why centralized: scattered magic numbers in tests rot. When a
 * tolerance is bumped to make a test pass without justification,
 * it usually masks a real regression. Forcing every test to import
 * one of these named constants makes the bump obvious in code review.
 *
 * Categories — never mix:
 *   - PURE_ANALYTIC: closed-form solutions vs known-exact references
 *     (Synolakis 1987 lab data, Hanks-Kanamori M0 identity).
 *   - SCALING_LAW: empirical regressions whose own published scatter
 *     is the limit of meaningful precision (Wells-Coppersmith ±0.3
 *     log-units, Strasser ±0.2 log-units, Mastin ±factor 2 at fixed V̇).
 *   - GEOCLAW_FIXTURE_*: 2D AMR vs 1D-radial closed-form spread.
 *     One per source class — see `scripts/geoclaw/run_scenario.py`.
 *   - GEOMETRY: Earth-scale geodesy round-off + WGS84 ellipsoid
 *     eccentricity ignored vs spherical-Earth assumption.
 *   - PROPERTY: tolerance for monotonicity / metamorphic checks
 *     (allows Float64 round-off but rejects systematic drift).
 *
 * Categories MUST NOT be repurposed. If a test needs a different
 * tolerance, add a new constant with a 1-sentence justification.
 */

// ----- Pure-math oracles -----

/** Synolakis 1987 BP1 analytic R/H envelope. NTHMP-accepted, ±10 % */
export const TOL_PURE_ANALYTIC = 0.2;

/** Hanks-Kanamori M0 = 10^(1.5·Mw + 9.05) — log identity, machine eps */
export const TOL_LOG_IDENTITY = 1e-12;

// ----- Engineering scaling laws -----

/** Wells-Coppersmith / Strasser / Mastin / Glasstone — published ±factor 2 */
export const TOL_SCALING_LAW = 0.5;

/** Specifically for seismic far-field tsunami amplitudes (DART buoy
 *  filtering + tidal de-trending + bottom-pressure-to-amp inversion
 *  each carry ±10 %). Bernard 2006, Satake 2013. */
export const TOL_DART_AMPLITUDE = 0.25;

// ----- GeoClaw fixture pins (per source class) -----
// MUST match `DEFAULT_TOLERANCE_BY_TYPE` in scripts/geoclaw/run_scenario.py
// Re-document the rationale here so it can be changed in lock-step.

/** Megathrust seismic — L/W=2.5 default radiates strongly perpendicular
 *  to strike; Nimbus 1D-radial isotropy can be off by factor 2-3 vs 2D AMR. */
export const TOL_GEOCLAW_SEISMIC = 2.0;

/** Volcanic flank/caldera collapse — Watts 2000 has factor-3 scatter
 *  vs observation, plus 1D-radial vs 2D mismatch. */
export const TOL_GEOCLAW_VOLCANIC = 4.0;

/** Submarine landslide — Watts submarine coefficient better constrained
 *  but elongated-slump geometry mismatch dominates. */
export const TOL_GEOCLAW_LANDSLIDE = 2.0;

/** Deep-ocean impact — Ward-Asphaug cavity model has factor-3 scatter;
 *  cavity collapse is a 3D phenomenon SWE can't resolve at the source. */
export const TOL_GEOCLAW_IMPACT = 4.0;

// ----- Geometry -----

/** Spherical-Earth haversine vs WGS84 ellipsoid: max ~0.5 % at high
 *  latitudes; 0.1 % is the typical equatorial-band match. */
export const TOL_GEODETIC_KM = 0.005; // 0.5 %

/** Lat/lon round-trip after a no-op transformation. Should be
 *  machine-epsilon; we allow 1e-10 deg ≈ 0.01 mm. */
export const TOL_LATLON_ROUNDTRIP_DEG = 1e-10;

/** Bounding-box equality between calculated and rendered geometry.
 *  Float32 globe coordinates can lose precision; 1e-6 deg ≈ 0.1 m. */
export const TOL_BBOX_DEG = 1e-6;

// ----- Property-based / metamorphic -----

/** Monotonicity / metamorphic invariants: should hold to round-off. */
export const TOL_MONOTONIC_RELATIVE = 1e-9;

/** Symmetry / rotation-invariance: same caveat. */
export const TOL_INVARIANT_RELATIVE = 1e-9;

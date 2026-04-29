import { STANDARD_GRAVITY } from '../constants.js';
import { MANNING_OPEN_OCEAN } from '../events/tsunami/manningFriction.js';

/**
 * Saint-Venant 1D radial shallow-water solver.
 *
 * Tier 2 of the GeoClaw-track tsunami refinement roadmap. Closes the
 * gap left by the Phase-19 closed-form pipeline (Manning + non-linear
 * shoaling) on compact-rupture far-field events: Tōhoku 2011's DART
 * 21413 amplitude is over-predicted by 3-7× by the cylindrical 1D
 * model because peaked slip distributions inject high-frequency
 * dispersion the closed-form Heidarzadeh-Satake decay cannot
 * capture. A real Saint-Venant solver evolves the wave shape on the
 * actual bathymetry and lets that physics emerge naturally.
 *
 * Equations (depth-averaged shallow water with Manning friction):
 *
 *     ∂h/∂t + ∂(h·u)/∂x = 0
 *     ∂(h·u)/∂t + ∂(h·u² + ½·g·h²)/∂x = -g·h·∂z/∂x - g·n²·u·|u|/h^(1/3)
 *
 * with state U = [h, h·u]ᵀ, flux F(U) = [h·u, h·u² + ½·g·h²]ᵀ,
 * topography z(x), Manning roughness n.
 *
 * Discretisation. Finite volume on a uniform 1D grid, HLL Riemann
 * solver at the cell interfaces (Harten-Lax-van Leer 1983 — first
 * order in space, robust at wet-dry boundaries). Forward-Euler in
 * time with CFL-constrained time step:
 *
 *     Δt = CFL · Δx / max_i (|u_i| + √(g·h_i))
 *
 * The HLL choice over the more accurate HLLC is deliberate: HLLC's
 * contact-discontinuity restoration matters for transonic flow but
 * costs us numerical robustness near the wet-dry interface, which is
 * the geometrically interesting boundary in tsunami run-up. The
 * GeoClaw George-LeVeque 2008 augmented Roe solver would be even
 * better but is order-of-magnitude more code than our popular-
 * science budget allows; HLL is the GeoClaw teaching-version
 * fall-back and reproduces dam-break + Carrier-Greenspan run-up to
 * within 5 % at uniform-grid resolution ≥ 200 cells.
 *
 * Wet-dry handling. Cells with `h ≤ DRY_DEPTH_M` are treated as dry
 * (zero momentum, zero outflow). The HLL flux respects this through
 * the `min(0, S_L)` and `max(0, S_R)` wave speeds — a dry cell
 * cannot send mass into the wet cell across the interface, only
 * receive.
 *
 * Layer 2 boundary preserved. Pure TS, no React / Cesium / Three /
 * DOM. Deterministic for a fixed grid and CFL.
 *
 * References:
 *   Saint-Venant, A. J. C. (1871). "Théorie du mouvement non
 *     permanent des eaux ..." C. R. Acad. Sci. 73: 147-154.
 *   Harten, A., Lax, P. D. & van Leer, B. (1983). "On upstream
 *     differencing and Godunov-type schemes for hyperbolic
 *     conservation laws." SIAM Review 25 (1): 35-61. The HLL
 *     Riemann solver derived in §3.
 *   Toro, E. F. (2009). "Riemann Solvers and Numerical Methods for
 *     Fluid Dynamics" (3rd ed.), Springer. Ch. 10 covers HLL/HLLC.
 *   LeVeque, R. J. & George, D. L. (2008). "High-resolution
 *     finite volume methods for the shallow water equations with
 *     bathymetry and dry states." Adv. Coastal Engng. 11: 43-73.
 *     The GeoClaw kernel reference.
 *   Imamura, F. (1995). "Review of tsunami simulation with a finite
 *     difference method." in Long-Wave Runup Models, World Scientific.
 *     Manning friction calibration.
 */

/** Cells with depth at or below this threshold are dry. The GeoClaw
 *  default for tsunami inundation is 1 mm; we use 1 cm so the popular-
 *  science solver doesn't waste time chasing micron-scale wet-dry
 *  oscillations on the foreshore. */
export const DRY_DEPTH_M = 0.01;

/** Upper bound on the time-step factor relative to the characteristic
 *  speed. Stable for HLL on a uniform grid up to CFL = 1; we run at
 *  0.5 for a comfortable margin against Manning-source-term stiffness
 *  near the foreshore. */
export const CFL_NUMBER = 0.5;

/** Hard cap on the number of time steps per simulation. Catches a
 *  runaway loop (e.g. CFL collapse on a degenerate bathymetry) before
 *  the Web Worker runs out of memory. 1e6 covers 30 minutes of wave
 *  propagation at 100 m grid spacing. */
const MAX_TIME_STEPS = 1_000_000;

export interface SaintVenant1DInput {
  /** Bathymetric profile (m, signed: + = land elevation, − = water
   *  depth). One value per cell, uniform spacing. */
  bathymetryM: readonly number[];
  /** Cell width Δx (m). All cells the same. */
  cellWidthM: number;
  /** Initial sea-surface displacement η₀ above mean sea level
   *  (m, one per cell). Use this to seed the source: for an impact
   *  cavity, place a depression at the centre; for a megathrust,
   *  a positive uplift over the rupture cells. */
  initialDisplacementM: readonly number[];
  /** Initial depth-averaged velocity (m/s, one per cell). Usually 0
   *  at the start of a tsunami simulation. */
  initialVelocityMPerS?: readonly number[];
  /** Total physical time to integrate (s). */
  durationS: number;
  /** Manning roughness n. Defaults to MANNING_OPEN_OCEAN (0.025). */
  manningN?: number;
  /** Surface gravity. Defaults to STANDARD_GRAVITY. */
  surfaceGravity?: number;
  /** CFL number (0 < CFL ≤ 1). Defaults to CFL_NUMBER (0.5). */
  cfl?: number;
  /** When provided, the solver records the wave-height time-series
   *  at every listed cell index. Use to extract DART-buoy-equivalent
   *  amplitudes. */
  probeCellIndices?: readonly number[];
  /** Numerical scheme. Default `'muscl-rk2'` is MUSCL second-order
   *  TVD reconstruction (minmod limiter) + SSP-RK2 time stepping —
   *  the same combo GeoClaw uses for shallow water. The fall-back
   *  `'hll-euler'` is plain first-order HLL + forward Euler, kept
   *  for regression tests against pre-Phase-21b behaviour and for
   *  diagnosing whether a regression is from the reconstruction
   *  vs the time stepper. */
  scheme?: 'muscl-rk2' | 'hll-euler';
  /** Geometry of the 1D problem.
   *
   *  - `'cartesian'` (default): straight 1D, no geometric source
   *    terms. Use for dam-break, lake-at-rest, channel propagation
   *    benchmarks where the wave does not spread laterally.
   *  - `'radial'`: 1D-cylindrical with the symmetry axis at the LEFT
   *    boundary (cell centre i has radius (i + ½)·Δx). Adds the
   *    geometric source terms
   *
   *        ∂h/∂t  ⊃  -h·u / r
   *        ∂(h·u)/∂t  ⊃  -h·u² / r
   *
   *    that turn straight 1D propagation into 2D-cylindrical
   *    spreading. Wave amplitude decays as 1/√r along characteristics,
   *    matching the Lamb 1932 long-wave radial solution. Use for
   *    seismic tsunami DART pins (Tōhoku, Sumatra) where the source
   *    is a finite-size patch and the observer sits 1000+ km away in
   *    open ocean. */
  geometry?: 'cartesian' | 'radial';
}

export interface SaintVenant1DProbeRecord {
  /** Cell index that was sampled. */
  cellIndex: number;
  /** Time stamps (s) — one per recorded sample. */
  timesS: number[];
  /** Sea-surface displacement η = h + z above mean sea level (m). */
  displacementsM: number[];
  /** Maximum |η| observed over the run, for quick "peak amplitude"
   *  pinning in tests. */
  peakAbsAmplitudeM: number;
}

export interface SaintVenant1DResult {
  /** Final water depth (m) at each cell. */
  finalDepthM: number[];
  /** Final depth-averaged velocity (m/s) at each cell. */
  finalVelocityMPerS: number[];
  /** Final sea-surface displacement (m) at each cell. */
  finalDisplacementM: number[];
  /** Maximum |η| ever observed at each cell. Tier-1-equivalent
   *  "envelope" you can use for post-hoc heatmap rendering or
   *  run-up reduction. */
  maxAbsDisplacementM: number[];
  /** Number of time steps actually executed. */
  timeStepsExecuted: number;
  /** Total simulated wall-clock physical time (s). */
  finalTimeS: number;
  /** Probe-cell time-series, in the same order as
   *  {@link SaintVenant1DInput.probeCellIndices}. Empty when no
   *  probes were requested. */
  probes: SaintVenant1DProbeRecord[];
}

/**
 * Minmod slope limiter (Roe 1986). Returns the minimum-magnitude
 * common direction of the two slopes, or 0 when they have opposite
 * signs. The result is used as a TVD slope for MUSCL reconstruction:
 * never overshoots the local extrema, which prevents spurious
 * oscillations near shocks while keeping the second-order accuracy
 * of the reconstruction in smooth regions.
 *
 * Reference: Roe, P. L. (1986). "Characteristic-based schemes for
 *   the Euler equations." Annu. Rev. Fluid Mech. 18: 337-365.
 */
function minmod(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.sign(a) * Math.min(Math.abs(a), Math.abs(b));
}

/**
 * HLL Riemann flux at an interface between left state (h_L, u_L) and
 * right state (h_R, u_R). Returns the conservative flux pair
 * `[mass, momentum]`. See Toro 2009 §10.3.
 *
 * Wave speeds: Davis 1988 simple-wave estimate
 *
 *     S_L = min(u_L − √(g·h_L), u_R − √(g·h_R))
 *     S_R = max(u_L + √(g·h_L), u_R + √(g·h_R))
 *
 * which is exact for a single-rarefaction or single-shock solution
 * and a safe upper bound otherwise.
 */
function hllFlux(
  hL: number,
  uL: number,
  hR: number,
  uR: number,
  g: number
): { mass: number; momentum: number } {
  // A wet/dry interface: dry side cannot transmit any flux from
  // its momentum (which is undefined for h = 0), so we degenerate
  // to a one-sided wave from the wet side.
  const wetL = hL > DRY_DEPTH_M;
  const wetR = hR > DRY_DEPTH_M;
  if (!wetL && !wetR) return { mass: 0, momentum: 0 };

  const cL = wetL ? Math.sqrt(g * hL) : 0;
  const cR = wetR ? Math.sqrt(g * hR) : 0;
  const sL = Math.min(wetL ? uL - cL : uR - 2 * cR, wetR ? uR - cR : uL - 2 * cL);
  const sR = Math.max(wetR ? uR + cR : uL + 2 * cL, wetL ? uL + cL : uR + 2 * cR);

  const fLmass = wetL ? hL * uL : 0;
  const fRmass = wetR ? hR * uR : 0;
  const fLmom = wetL ? hL * uL * uL + 0.5 * g * hL * hL : 0;
  const fRmom = wetR ? hR * uR * uR + 0.5 * g * hR * hR : 0;
  const uLcons = wetL ? hL * uL : 0;
  const uRcons = wetR ? hR * uR : 0;

  if (sL >= 0) return { mass: fLmass, momentum: fLmom };
  if (sR <= 0) return { mass: fRmass, momentum: fRmom };
  // Standard two-state HLL: F* = (S_R F_L − S_L F_R + S_L S_R (U_R − U_L)) / (S_R − S_L)
  const denom = sR - sL;
  const mass = (sR * fLmass - sL * fRmass + sL * sR * (hR - hL)) / denom;
  const momentum = (sR * fLmom - sL * fRmom + sL * sR * (uRcons - uLcons)) / denom;
  return { mass, momentum };
}

/**
 * Run the Saint-Venant 1D solver. Returns the final state plus the
 * envelope of the maximum |η| observed at each cell. See module
 * header for the equations and the discretisation choices.
 *
 * Determinism. Same input → same output, bit-for-bit. The HLL flux
 * uses a fixed-order arithmetic reduction so floating-point
 * associativity does not surface here.
 */
export function simulateSaintVenant1D(input: SaintVenant1DInput): SaintVenant1DResult {
  const N = input.bathymetryM.length;
  if (N < 3) {
    throw new Error(`simulateSaintVenant1D: grid must have at least 3 cells, got ${N.toString()}`);
  }
  if (input.initialDisplacementM.length !== N) {
    throw new Error(
      `simulateSaintVenant1D: initialDisplacementM length ${input.initialDisplacementM.length.toString()} != bathymetry length ${N.toString()}`
    );
  }
  const dx = input.cellWidthM;
  if (!Number.isFinite(dx) || dx <= 0) {
    throw new Error(`simulateSaintVenant1D: cellWidthM must be > 0, got ${dx.toString()}`);
  }
  const duration = input.durationS;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`simulateSaintVenant1D: durationS must be > 0, got ${duration.toString()}`);
  }
  const g = input.surfaceGravity ?? STANDARD_GRAVITY;
  const cfl = input.cfl ?? CFL_NUMBER;
  const n = input.manningN ?? MANNING_OPEN_OCEAN;
  const probes = (input.probeCellIndices ?? []).filter(
    (i) => Number.isFinite(i) && i >= 0 && i < N
  );

  // Initial depth h = max(η - z, 0). Sign convention: z negative
  // under the sea (depth is -z above the geoid), z positive on land
  // (elevation). η = h + z, the sea-surface displacement above mean
  // sea level. So initial h = η₀ - z; if z > η₀ the cell starts dry.
  const h = new Float64Array(N);
  const hu = new Float64Array(N);
  const z = Float64Array.from(input.bathymetryM);
  for (let i = 0; i < N; i++) {
    const eta0 = input.initialDisplacementM[i] ?? 0;
    const depth0 = eta0 - (z[i] ?? 0);
    h[i] = depth0 > 0 ? depth0 : 0;
    if (input.initialVelocityMPerS !== undefined) {
      const u0 = input.initialVelocityMPerS[i] ?? 0;
      hu[i] = (h[i] ?? 0) * u0;
    }
  }
  const maxAbsEta = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    maxAbsEta[i] = Math.abs(input.initialDisplacementM[i] ?? 0);
  }

  // Probe recording state.
  const probeRecords: SaintVenant1DProbeRecord[] = probes.map((idx) => ({
    cellIndex: idx,
    timesS: [0],
    displacementsM: [input.initialDisplacementM[idx] ?? 0],
    peakAbsAmplitudeM: Math.abs(input.initialDisplacementM[idx] ?? 0),
  }));

  let t = 0;
  let step = 0;
  const useMuscl = (input.scheme ?? 'muscl-rk2') === 'muscl-rk2';
  const useRadial = (input.geometry ?? 'cartesian') === 'radial';

  // Scratch buffers reused every step to avoid per-step allocation.
  const fluxMass = new Float64Array(N + 1);
  const fluxMom = new Float64Array(N + 1);
  const slopeH = new Float64Array(N);
  const slopeHU = new Float64Array(N);
  const dh = new Float64Array(N);
  const dhu = new Float64Array(N);
  const hStar = new Float64Array(N);
  const huStar = new Float64Array(N);
  const dhStar = new Float64Array(N);
  const dhuStar = new Float64Array(N);

  /**
   * Compute the right-hand side L(U) = -∂F/∂x + S of the Saint-Venant
   * system at every cell, given the conservative state (hLocal,
   * huLocal). Writes into dhOut, dhuOut. Used twice per RK2 step or
   * once per Euler step.
   *
   * Reconstruction: piecewise-constant for `'hll-euler'`, MUSCL with
   * minmod limiter for `'muscl-rk2'`. The MUSCL reconstruction
   * advances the interface states from the cell centres by ±½·Δx·s,
   * where s is the limited slope, before passing to the HLL Riemann
   * solver. This is the key step that drops HLL's numerical
   * dissipation by an order of magnitude on smooth waves.
   */
  const computeRhs = (
    hLocal: Float64Array,
    huLocal: Float64Array,
    dhOut: Float64Array,
    dhuOut: Float64Array
  ): void => {
    if (useMuscl) {
      // Reset boundary slopes; interior slopes use minmod of the
      // backward and forward differences.
      slopeH[0] = 0;
      slopeHU[0] = 0;
      slopeH[N - 1] = 0;
      slopeHU[N - 1] = 0;
      for (let i = 1; i < N - 1; i++) {
        const hPrev = hLocal[i - 1] ?? 0;
        const hCur = hLocal[i] ?? 0;
        const hNext = hLocal[i + 1] ?? 0;
        const huPrev = huLocal[i - 1] ?? 0;
        const huCur = huLocal[i] ?? 0;
        const huNext = huLocal[i + 1] ?? 0;
        slopeH[i] = minmod((hCur - hPrev) / dx, (hNext - hCur) / dx);
        slopeHU[i] = minmod((huCur - huPrev) / dx, (huNext - huCur) / dx);
      }
    } else {
      slopeH.fill(0);
      slopeHU.fill(0);
    }

    // Hydrostatic-balanced wall boundary. A no-flux wall must
    // mirror the local pressure (½·g·h²) to cancel the momentum
    // flux divergence in a lake-at-rest state. Setting fluxMom = 0
    // here would generate spurious negative momentum at the
    // boundary cells equal to the full -½·g·h²·Δt/Δx — for h = 4 km
    // that is ~−2 × 10⁵ m²/s per step at deep ocean, blowing the
    // solver up within tens of steps. Mass flux stays at zero
    // (no water crosses the wall).
    const hBoundaryL = hLocal[0] ?? 0;
    const hBoundaryR = hLocal[N - 1] ?? 0;
    fluxMass[0] = 0;
    fluxMom[0] = 0.5 * g * hBoundaryL * hBoundaryL;
    fluxMass[N] = 0;
    fluxMom[N] = 0.5 * g * hBoundaryR * hBoundaryR;

    for (let i = 0; i < N - 1; i++) {
      // MUSCL-reconstructed states at the cell-edges. For 'hll-euler'
      // the slopes are zero so the reconstruction degenerates to
      // piecewise-constant (cell average).
      const hLraw = (hLocal[i] ?? 0) + 0.5 * dx * (slopeH[i] ?? 0);
      const hRraw = (hLocal[i + 1] ?? 0) - 0.5 * dx * (slopeH[i + 1] ?? 0);
      const huLraw = (huLocal[i] ?? 0) + 0.5 * dx * (slopeHU[i] ?? 0);
      const huRraw = (huLocal[i + 1] ?? 0) - 0.5 * dx * (slopeHU[i + 1] ?? 0);
      // Clamp h ≥ 0 to keep the reconstructed state physical at
      // wet-dry interfaces.
      const hL = hLraw > 0 ? hLraw : 0;
      const hR = hRraw > 0 ? hRraw : 0;
      const uL = hL > DRY_DEPTH_M ? huLraw / hL : 0;
      const uR = hR > DRY_DEPTH_M ? huRraw / hR : 0;
      const f = hllFlux(hL, uL, hR, uR, g);
      fluxMass[i + 1] = f.mass;
      fluxMom[i + 1] = f.momentum;
    }

    for (let i = 0; i < N; i++) {
      const fluxDivMass = (fluxMass[i + 1] ?? 0) - (fluxMass[i] ?? 0);
      const fluxDivMom = (fluxMom[i + 1] ?? 0) - (fluxMom[i] ?? 0);
      // Topography slope source: -g·h·∂z/∂x, centred difference.
      const zL = z[Math.max(i - 1, 0)] ?? 0;
      const zR = z[Math.min(i + 1, N - 1)] ?? 0;
      const dzdx = (zR - zL) / (2 * dx);
      const hCell = hLocal[i] ?? 0;
      const sourceMom = -g * hCell * dzdx;
      dhOut[i] = -fluxDivMass / dx;
      dhuOut[i] = -fluxDivMom / dx + sourceMom;
      // Radial geometry: add the cylindrical-spread source terms
      //     ∂h/∂t   ⊃ -h·u / r
      //     ∂(h·u)/∂t ⊃ -h·u² / r
      // which turn 1D Cartesian propagation into 2D radial spreading.
      // r is the cell-centre radius from the symmetry axis at the
      // left boundary: r_i = (i + ½)·Δx. The amplitude then decays
      // as ~1/√r along characteristics, matching Lamb 1932.
      if (useRadial) {
        const r = (i + 0.5) * dx;
        const huCell = huLocal[i] ?? 0;
        const u = hCell > DRY_DEPTH_M ? huCell / hCell : 0;
        dhOut[i] = (dhOut[i] ?? 0) - huCell / r;
        dhuOut[i] = (dhuOut[i] ?? 0) - (huCell * u) / r;
      }
    }
  };

  /**
   * Apply the implicit Manning friction step to (hCell, huCell).
   * Returns the friction-corrected huCell. Solves
   *     hu_{n+1} = hu_n / (1 + Δt · g·n²·|u|/h^(4/3))
   * which keeps the velocity bounded as h → 0 (where the explicit
   * form would blow up). Cells below DRY_DEPTH_M get zero momentum.
   */
  const applyManningFriction = (hCell: number, huCell: number, dtLocal: number): number => {
    if (hCell <= DRY_DEPTH_M || n <= 0) return hCell <= DRY_DEPTH_M ? 0 : huCell;
    const uTrial = huCell / hCell;
    const friction = (dtLocal * g * n * n * Math.abs(uTrial)) / Math.pow(hCell, 4 / 3);
    return huCell / (1 + friction);
  };

  while (t < duration && step < MAX_TIME_STEPS) {
    // CFL-constrained time step. Compute the maximum local wave
    // speed across the wet cells; dry cells contribute nothing.
    let maxSpeed = 0;
    for (let i = 0; i < N; i++) {
      const hi = h[i] ?? 0;
      if (hi <= DRY_DEPTH_M) continue;
      const hui = hu[i] ?? 0;
      const u = hui / Math.max(hi, DRY_DEPTH_M);
      const c = Math.sqrt(g * hi);
      const s = Math.abs(u) + c;
      if (s > maxSpeed) maxSpeed = s;
    }
    if (maxSpeed === 0) break; // entire domain dry — nothing left to evolve
    let dt = (cfl * dx) / maxSpeed;
    if (t + dt > duration) dt = duration - t;
    if (dt <= 0) break;

    if (useMuscl) {
      // SSP-RK2 (Shu & Osher 1988): two-stage Runge-Kutta that
      // preserves TVD if the underlying spatial discretisation does.
      // Stage 1: U* = U^n + Δt · L(U^n).
      computeRhs(h, hu, dh, dhu);
      for (let i = 0; i < N; i++) {
        const hNext = (h[i] ?? 0) + dt * (dh[i] ?? 0);
        hStar[i] = hNext > 0 ? hNext : 0;
        huStar[i] = (hu[i] ?? 0) + dt * (dhu[i] ?? 0);
      }
      // Stage 2: U^{n+1} = ½(U^n + U* + Δt · L(U*)).
      computeRhs(hStar, huStar, dhStar, dhuStar);
      for (let i = 0; i < N; i++) {
        const hOld = h[i] ?? 0;
        const huOld = hu[i] ?? 0;
        let hNew = 0.5 * hOld + 0.5 * ((hStar[i] ?? 0) + dt * (dhStar[i] ?? 0));
        if (hNew < 0) hNew = 0;
        let huNew = 0.5 * huOld + 0.5 * ((huStar[i] ?? 0) + dt * (dhuStar[i] ?? 0));
        huNew = applyManningFriction(hNew, huNew, dt);
        h[i] = hNew;
        hu[i] = huNew;
        const eta = hNew + (z[i] ?? 0);
        const absEta = Math.abs(eta);
        if (absEta > (maxAbsEta[i] ?? 0)) maxAbsEta[i] = absEta;
      }
    } else {
      // Plain forward-Euler with first-order HLL — kept for
      // regression diagnostic. Same behaviour as Phase-21a.
      computeRhs(h, hu, dh, dhu);
      for (let i = 0; i < N; i++) {
        const hOld = h[i] ?? 0;
        const huOld = hu[i] ?? 0;
        let hNew = hOld + dt * (dh[i] ?? 0);
        if (hNew < 0) hNew = 0;
        let huNew = huOld + dt * (dhu[i] ?? 0);
        huNew = applyManningFriction(hNew, huNew, dt);
        h[i] = hNew;
        hu[i] = huNew;
        const eta = hNew + (z[i] ?? 0);
        const absEta = Math.abs(eta);
        if (absEta > (maxAbsEta[i] ?? 0)) maxAbsEta[i] = absEta;
      }
    }

    // Record probes after the step. Pushed at the END of the step
    // so the time-series matches the post-step state.
    t += dt;
    step += 1;
    for (let p = 0; p < probes.length; p++) {
      const rec = probeRecords[p];
      const idx = probes[p];
      if (rec === undefined || idx === undefined) continue;
      const hAtProbe = h[idx] ?? 0;
      const zAtProbe = z[idx] ?? 0;
      const eta = hAtProbe + zAtProbe;
      rec.timesS.push(t);
      rec.displacementsM.push(eta);
      const a = Math.abs(eta);
      if (a > rec.peakAbsAmplitudeM) rec.peakAbsAmplitudeM = a;
    }
  }

  const finalDepth = Array.from(h);
  const finalVelocity: number[] = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    const hi = h[i] ?? 0;
    finalVelocity[i] = hi > DRY_DEPTH_M ? (hu[i] ?? 0) / hi : 0;
  }
  const finalDisplacement: number[] = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    finalDisplacement[i] = (h[i] ?? 0) + (z[i] ?? 0);
  }

  return {
    finalDepthM: finalDepth,
    finalVelocityMPerS: finalVelocity,
    finalDisplacementM: finalDisplacement,
    maxAbsDisplacementM: Array.from(maxAbsEta),
    timeStepsExecuted: step,
    finalTimeS: t,
    probes: probeRecords,
  };
}

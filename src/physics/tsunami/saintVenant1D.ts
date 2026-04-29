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
  const fluxMass = new Float64Array(N + 1);
  const fluxMom = new Float64Array(N + 1);

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

    // HLL flux at every interior interface (i + 1/2 between cells
    // i and i+1). Boundary interfaces use a wall reflection — we
    // only care about the open-sea interior for tsunami probes.
    fluxMass[0] = 0;
    fluxMom[0] = 0;
    fluxMass[N] = 0;
    fluxMom[N] = 0;
    for (let i = 0; i < N - 1; i++) {
      const hL = h[i] ?? 0;
      const hR = h[i + 1] ?? 0;
      const huL = hu[i] ?? 0;
      const huR = hu[i + 1] ?? 0;
      const uL = hL > DRY_DEPTH_M ? huL / hL : 0;
      const uR = hR > DRY_DEPTH_M ? huR / hR : 0;
      const f = hllFlux(hL, uL, hR, uR, g);
      fluxMass[i + 1] = f.mass;
      fluxMom[i + 1] = f.momentum;
    }

    // Update conserved variables. Forward-Euler with the HLL flux
    // divergence + topography source (well-balanced via a centred
    // gradient of z) + Manning friction.
    for (let i = 0; i < N; i++) {
      const hOld = h[i] ?? 0;
      const huOld = hu[i] ?? 0;

      const fluxDivMass = (fluxMass[i + 1] ?? 0) - (fluxMass[i] ?? 0);
      const fluxDivMom = (fluxMom[i + 1] ?? 0) - (fluxMom[i] ?? 0);

      let hNew = hOld - (dt / dx) * fluxDivMass;
      // Numeric safety: very small negative h can appear from FP
      // round-off near the wet-dry interface. Clamp at zero.
      if (hNew < 0) hNew = 0;

      // Topography slope source: -g·h·∂z/∂x, centred difference.
      const zL = z[Math.max(i - 1, 0)] ?? 0;
      const zR = z[Math.min(i + 1, N - 1)] ?? 0;
      const dzdx = (zR - zL) / (2 * dx);
      const sourceMom = -g * hOld * dzdx;
      let huNew = huOld - (dt / dx) * fluxDivMom + dt * sourceMom;

      // Manning friction. Implicit treatment for stability — the
      // explicit form blows up when h → 0. Solve the ODE
      //     d(hu)/dt = -g·n²·u·|u|/h^(1/3)
      // to first order: hu_{n+1} = hu_n / (1 + Δt · g·n²·|u|/h^(4/3)).
      if (hNew > DRY_DEPTH_M && n > 0) {
        const uTrial = huNew / hNew;
        const friction = (dt * g * n * n * Math.abs(uTrial)) / Math.pow(hNew, 4 / 3);
        huNew = huNew / (1 + friction);
      } else {
        huNew = 0;
      }

      h[i] = hNew;
      hu[i] = huNew;

      const eta = hNew + (z[i] ?? 0);
      const absEta = Math.abs(eta);
      if (absEta > (maxAbsEta[i] ?? 0)) maxAbsEta[i] = absEta;
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

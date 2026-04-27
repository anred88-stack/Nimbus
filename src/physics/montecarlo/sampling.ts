/**
 * Deterministic seeded pseudo-random sampler for the Monte Carlo
 * engine. Every run with the same seed produces the same output
 * sequence, so MC results are reproducible in unit tests and
 * shareable via a URL (same URL = same percentiles).
 *
 * PRNG: Mulberry32, a 32-bit counter-based generator. Period 2³²,
 * high-quality output for a few million samples — safely covers a
 * few-hundred-iteration scenario-space sweep. Not suitable for
 * cryptography, which is irrelevant here.
 *
 * References:
 *   Box, G. E. P. & Muller, M. E. (1958). "A Note on the Generation
 *    of Random Normal Deviates." Annals of Mathematical Statistics
 *    29 (2), 610–611. — for the normal deviate transform.
 *   Melosh, H. J. (1989). "Impact Cratering: A Geologic Process."
 *    Oxford University Press, Ch. 5. — for the sin(2θ) angle
 *    distribution of randomly-oriented impactors.
 *   Popova, O. P. et al. (2011). "Very low strengths of inter-
 *    planetary meteoroids and small asteroids." M&PS 46 (10). —
 *    for the log-normal spread in bolide tensile strength.
 */

/** Deterministic seeded RNG. Call `.next()` to draw uniform [0, 1). */
export interface Rng {
  next: () => number;
}

/**
 * Mulberry32 PRNG. Seed can be any 32-bit integer — we accept a
 * string-or-number seed for convenience and hash a string to its
 * first four bytes.
 */
export function mulberry32(seed: number | string): Rng {
  let a: number;
  if (typeof seed === 'number') {
    a = seed >>> 0;
  } else {
    // Simple FNV-style hash, good enough to turn a seed string into
    // a 32-bit integer.
    let h = 2_166_136_261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h = ((h ^ seed.charCodeAt(i)) * 16_777_619) >>> 0;
    }
    a = h;
  }
  return {
    next: (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}

/**
 * Draw a normal-deviate sample N(mean, std) via the polar Box-Muller
 * transform. Returns one value per call (the paired value is
 * discarded — simpler than keeping state).
 */
export function sampleNormal(rng: Rng, mean: number, std: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng.next();
  while (v === 0) v = rng.next();
  const mag = Math.sqrt(-2 * Math.log(u)) * std;
  return mag * Math.cos(2 * Math.PI * v) + mean;
}

/**
 * Draw a log-normal sample with the given median and the given
 * standard deviation σ of ln(X). In the canonical parametrisation
 * used for log-normally scattered physical quantities (Popova 2011
 * meteoroid strengths, Mastin 2009 plume heights), `sigmaLog` is
 * what the papers report — not the linear standard deviation.
 */
export function sampleLognormal(rng: Rng, median: number, sigmaLog: number): number {
  const mu = Math.log(median);
  return Math.exp(sampleNormal(rng, mu, sigmaLog));
}

/**
 * Draw a uniform random number in [min, max].
 */
export function sampleUniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}

/**
 * Draw a random impact angle from a horizontal surface, weighted by
 * sin(2θ). The textbook result for isotropically-incoming impactors
 * is that the *most probable* angle is 45°, with shallow grazing
 * (θ → 0°) and normal incidence (θ → 90°) both under-weighted. Angle
 * is returned in the caller-preferred unit — we return radians to
 * match {@link impactAngle} conventions.
 *
 * Source: Melosh 1989 "Impact Cratering: A Geologic Process" Ch. 5.
 */
export function sampleImpactAngle(rng: Rng): number {
  // Inverse CDF of sin(2θ) over [0, π/2]: solve u = sin²(θ) → θ = arcsin(√u).
  const u = rng.next();
  return Math.asin(Math.sqrt(u));
}

/**
 * Draw a sample from a finite discrete set with optional weights.
 * Weights default to uniform when omitted.
 */
export function sampleDiscrete<T>(rng: Rng, choices: readonly T[], weights?: readonly number[]): T {
  if (choices.length === 0) {
    throw new Error('sampleDiscrete: choices must be non-empty');
  }
  const ws = weights ?? choices.map(() => 1);
  if (ws.length !== choices.length) {
    throw new Error('sampleDiscrete: weights length must match choices');
  }
  const total = ws.reduce((s, w) => s + w, 0);
  if (!(total > 0)) {
    throw new Error('sampleDiscrete: weights must have a positive sum');
  }
  const r = rng.next() * total;
  let acc = 0;
  for (let i = 0; i < choices.length; i++) {
    const w = ws[i];
    if (w === undefined) continue;
    acc += w;
    if (r < acc) {
      const c = choices[i];
      if (c === undefined) continue;
      return c;
    }
  }
  const last = choices[choices.length - 1];
  if (last === undefined) throw new Error('sampleDiscrete: unreachable');
  return last;
}

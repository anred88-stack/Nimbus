import type { Joules, Meters } from '../../units.js';
import { joulesToMegatons, m } from '../../units.js';

/**
 * Target-ground coefficient K (metres) in the apparent-crater scaling
 *     D_a = K · W_kt^0.3
 *
 * Representative values, reading Glasstone & Dolan (1977) Fig. 6.70
 * alongside the primary-source cratering fits:
 *   HARD_ROCK    40   — granite, basalt, competent bedrock.
 *                       Murphey & Vortman (1961) "Crater diameter vs.
 *                       yield for rock bursts", SC-4676(RR), Sandia.
 *   FIRM_GROUND  60   — tuff, limestone, dense soil (default).
 *                       Nordyke (1977) desert-alluvium fit, JGR 82(30).
 *   DRY_SOIL     75   — sand, gravel, loose earth. Nordyke (1977).
 *   WET_SOIL     92   — saturated alluvium, coral reef. Nordyke (1977).
 *   CLAY        105   — water-saturated clay / soft muck, from
 *                       Young (1997) SAND97-2426 "Penetration
 *                       equations", cratering adaptation.
 *
 * These coefficients carry ±30 % scatter in the measured-tests dataset
 * (Plowshare craters, Jangle S/U, Sedan, Castle Bravo, Prairie Flat,
 * Essex I/II). They are intended for headline popular-science display,
 * not engineering design.
 */
export const NUCLEAR_CRATER_COEFFICIENT = {
  HARD_ROCK: 40,
  FIRM_GROUND: 60,
  DRY_SOIL: 75,
  WET_SOIL: 92,
  CLAY: 105,
} as const;

/**
 * Inputs for {@link nuclearApparentCraterDiameter}.
 */
export interface NuclearCraterInput {
  /** Total explosive yield (J). */
  yieldEnergy: Joules;
  /**
   * Target-ground coefficient K (m). Defaults to 60 (firm ground).
   * See {@link NUCLEAR_CRATER_COEFFICIENT} for named presets.
   */
  groundCoefficient?: number;
}

/**
 * Apparent (post-collapse rim-to-rim) crater diameter for a nuclear
 * contact surface burst, via Nordyke's cube-root-ish yield scaling:
 *
 *     D_a = K · W_kt^0.3            (W in kilotons TNT-equivalent)
 *
 * The exponent 0.3 is slightly less than pure cube-root scaling, because
 * larger yields spend proportionally more energy on ejecta loft and
 * late-stage crater modification rather than direct excavation.
 *
 * Source: Glasstone & Dolan (1977), "The Effects of Nuclear Weapons"
 * (3rd ed.), U.S. DoD/DoE, §6.70 and Fig. 6.70; scaling form from
 * Nordyke (1977), "An analysis of cratering data from desert alluvium",
 * J. Geophys. Res. 82(30), 4397–4406, DOI: 10.1029/JB082i030p04397.
 *
 * Caveats for popular-science display:
 *   - Surface contact burst. Airbursts at practical heights form no
 *     measurable crater; subsurface bursts (Plowshare-style) excavate
 *     much more than the apparent formula predicts.
 *   - Empirical K values scatter by ±30 % with local geology, water
 *     table, and rock fabric.
 */
export function nuclearApparentCraterDiameter(input: NuclearCraterInput): Meters {
  const W_kt = (joulesToMegatons(input.yieldEnergy) as number) * 1000;
  const K = input.groundCoefficient ?? NUCLEAR_CRATER_COEFFICIENT.FIRM_GROUND;
  return m(K * W_kt ** 0.3);
}

/**
 * U.S. Standard Atmosphere, 1976 (USSA-76).
 *
 * Piecewise-linear-temperature reference atmosphere extending from
 * sea level (geometric altitude 0 m) to the upper mesosphere (≈ 86 km
 * geopotential), maintained by NOAA / NASA / USAF as the canonical
 * reference for atmospheric-entry dynamics, ballistic propagation,
 * and aviation. Replaces the constant-density / constant-scale-height
 * approximation used previously by the airburst classifier
 * (RHO_0 = 1.225, H_SCALE = 8 000) — those values are correct only
 * within the lowest scale height; the ash-settling and stratospheric-
 * entry pipelines need a real altitude-dependent profile.
 *
 * Implementation follows the seven-layer hydrostatic recipe published
 * in NOAA-S/T 76-1562, "U.S. Standard Atmosphere, 1976" (NASA TM-X-
 * 74335, NOAA, USAF), §1.3 "Defining Constants" and §1.4 "Mathematical
 * Definitions". Each layer is bracketed by a base geopotential
 * altitude h_b, a base temperature T_b, and a thermal lapse rate L_b
 * (K/m). Above the layer base, temperature varies linearly with
 * geopotential altitude:
 *
 *     T(h) = T_b + L_b · (h − h_b)
 *
 * Pressure follows the hydrostatic + ideal-gas integrals:
 *
 *     P(h) = P_b · (T(h) / T_b)^(−g₀ · M / (R* · L_b))            L_b ≠ 0
 *     P(h) = P_b · exp(−g₀ · M · (h − h_b) / (R* · T_b))           L_b = 0
 *
 * Density is recovered via the ideal-gas law:
 *
 *     ρ(h) = P(h) · M / (R* · T(h))
 *
 * The 7-layer table covers 0 → 86 km. Above 86 km the model switches
 * to a more complex molecular-mass-dependent regime that the popular-
 * science envelope here does not need; the upper-altitude callers
 * (HEMP at 400 km for Starfish Prime, stratospheric dust injection)
 * use macroscopic flux/coupling factors that don't read pressure from
 * this module. We clamp queries above 86 km to the layer-7 ceiling
 * value and document the truncation.
 *
 * Geopotential vs geometric altitude: USSA-76 distinguishes the two
 * (h_geopot = R_E · z / (R_E + z)). For altitudes ≤ 86 km the
 * difference is < 1.4 % — well below the tolerance of any downstream
 * physics in this project — so we treat the input as geopotential and
 * note the simplification here for correctness-aware reviewers.
 *
 * References:
 *   National Oceanic and Atmospheric Administration, National
 *     Aeronautics and Space Administration, & United States Air Force
 *     (1976). "U.S. Standard Atmosphere, 1976." NOAA-S/T 76-1562,
 *     NASA-TM-X-74335. Government Printing Office, Washington DC.
 *     Available at: https://ntrs.nasa.gov/citations/19770009539
 */

/** Sea-level base pressure (Pa). USSA-76 §1.3.1. Re-exported from
 *  constants.ts so callers using the USSA module don't have to mix
 *  imports. */
export const USSA_SEA_LEVEL_PRESSURE = 101_325;
/** Sea-level base temperature (K). USSA-76 §1.3.1. */
export const USSA_SEA_LEVEL_TEMPERATURE = 288.15;
/** Sea-level base density (kg/m³). USSA-76 §1.3.1. */
export const USSA_SEA_LEVEL_DENSITY = 1.225;
/** Standard gravity (m/s²). USSA-76 §1.3.1; matches ISO 80000-3. */
const G0 = 9.806_65;
/** Mean molar mass of dry air (kg/mol). USSA-76 §1.3.1. */
const M_AIR = 0.028_964_4;
/** Universal gas constant (J/(mol·K)). USSA-76 §1.3.1. */
const R_STAR = 8.314_462_618;

interface AtmosphericLayer {
  /** Layer-base geopotential altitude (m). */
  baseAltitude: number;
  /** Layer-base temperature (K). */
  baseTemperature: number;
  /** Lapse rate (K/m). 0 in isothermal layers. */
  lapseRate: number;
  /** Layer-base pressure (Pa). Pre-computed at module load to skip
   *  iterating from sea level on every query. */
  basePressure: number;
}

// Lapse-rate table from NOAA-S/T 76-1562 Table 4.
// Pressure values at each layer base are derived via the hydrostatic
// integrals above; the constants are pinned by USSA-76's defining
// surface conditions, so they are deterministic and computed once.
const LAYERS: AtmosphericLayer[] = (() => {
  const definitions: { baseAltitude: number; baseTemperature: number; lapseRate: number }[] = [
    { baseAltitude: 0, baseTemperature: 288.15, lapseRate: -0.006_5 }, // troposphere
    { baseAltitude: 11_000, baseTemperature: 216.65, lapseRate: 0 }, // tropopause
    { baseAltitude: 20_000, baseTemperature: 216.65, lapseRate: 0.001 }, // strat 1
    { baseAltitude: 32_000, baseTemperature: 228.65, lapseRate: 0.002_8 }, // strat 2
    { baseAltitude: 47_000, baseTemperature: 270.65, lapseRate: 0 }, // stratopause
    { baseAltitude: 51_000, baseTemperature: 270.65, lapseRate: -0.002_8 }, // meso 1
    { baseAltitude: 71_000, baseTemperature: 214.65, lapseRate: -0.002 }, // meso 2
  ];
  const layers: AtmosphericLayer[] = [];
  let basePressure = USSA_SEA_LEVEL_PRESSURE;
  for (let i = 0; i < definitions.length; i++) {
    const def = definitions[i];
    if (def === undefined) continue;
    layers.push({ ...def, basePressure });
    const next = definitions[i + 1];
    if (next === undefined) continue;
    const dh = next.baseAltitude - def.baseAltitude;
    if (def.lapseRate === 0) {
      basePressure *= Math.exp((-G0 * M_AIR * dh) / (R_STAR * def.baseTemperature));
    } else {
      const Ttop = def.baseTemperature + def.lapseRate * dh;
      basePressure *= (Ttop / def.baseTemperature) ** ((-G0 * M_AIR) / (R_STAR * def.lapseRate));
    }
  }
  return layers;
})();

const LAYER_CEILING_M = 86_000;

function layerForAltitude(altitudeMeters: number): AtmosphericLayer {
  const z = Math.max(0, Math.min(altitudeMeters, LAYER_CEILING_M));
  // Linear scan — only 7 entries, faster than a binary search for that
  // size and keeps the code legible for reviewers. The first layer
  // (sea-level troposphere) is the guaranteed fallback because the
  // table starts at altitude 0.
  let chosen: AtmosphericLayer | undefined;
  for (const layer of LAYERS) {
    if (layer.baseAltitude <= z) chosen = layer;
    else break;
  }
  if (chosen === undefined) {
    throw new Error('USSA layer table is empty — module bootstrap failed');
  }
  return chosen;
}

/**
 * Atmospheric temperature (K) at the requested geopotential altitude.
 * Clamped to the [0, 86 000 m] domain of USSA-76's lapse-rate table;
 * altitudes outside the domain return the corresponding boundary
 * temperature.
 */
export function ussaTemperature(altitudeMeters: number): number {
  const z = Math.max(0, Math.min(altitudeMeters, LAYER_CEILING_M));
  const layer = layerForAltitude(z);
  return layer.baseTemperature + layer.lapseRate * (z - layer.baseAltitude);
}

/**
 * Atmospheric pressure (Pa) at the requested geopotential altitude.
 * Same clamp as {@link ussaTemperature}.
 */
export function ussaPressure(altitudeMeters: number): number {
  const z = Math.max(0, Math.min(altitudeMeters, LAYER_CEILING_M));
  const layer = layerForAltitude(z);
  const dh = z - layer.baseAltitude;
  if (layer.lapseRate === 0) {
    return layer.basePressure * Math.exp((-G0 * M_AIR * dh) / (R_STAR * layer.baseTemperature));
  }
  const Tz = layer.baseTemperature + layer.lapseRate * dh;
  return (
    layer.basePressure *
    (Tz / layer.baseTemperature) ** ((-G0 * M_AIR) / (R_STAR * layer.lapseRate))
  );
}

/**
 * Atmospheric density (kg/m³) at the requested geopotential altitude
 * via the ideal-gas law on temperature + pressure.
 */
export function ussaDensity(altitudeMeters: number): number {
  return (ussaPressure(altitudeMeters) * M_AIR) / (R_STAR * ussaTemperature(altitudeMeters));
}

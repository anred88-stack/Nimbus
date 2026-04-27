import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Extended-footprint estimators for large volcanic eruptions:
 *   - energy-line pyroclastic-flow runout (Dade & Huppert 1998),
 *   - VEI → peak global ΔT climate cooling (Sato 1993 / Robock 2000),
 *   - plinian ashfall 1 mm isopach area,
 *   - lahar / debris-flow runout (Iverson 1997 / Vallance & Iverson 2015).
 *
 * Each helper is intentionally simple (single power law or linear band)
 * because the published uncertainty on all four is at least ±factor 2.
 * Test tolerances reflect that.
 */

/**
 * Pyroclastic-density-current runout using the Dade & Huppert (1998)
 * energy-line model:
 *
 *   Dade, W. B. & Huppert, H. E. (1998). "Long-runout rockfalls."
 *    Geology 26 (9): 803–806; and "Emplacement of the 1.8 Ga Sudbury
 *    ejecta layer" Nature 393 (6680): 160–162. DOI: 10.1038/30179.
 *   Hayashi & Self (1992). "A comparison of pyroclastic flow and
 *    debris avalanche mobility." J. Geophys. Res. 97 (B6).
 *
 * The flow descends along an effective "energy line" of slope H/L
 * ~ 0.08–0.12 for dense PDCs. Given a plume (or column-collapse)
 * height H, the runout is L ≈ H / slope. Use 0.10 as the median.
 */
export function pdcRunoutEnergyLine(plumeHeight: Meters, slopeHoverL = 0.1): Meters {
  const H = plumeHeight as number;
  if (!Number.isFinite(H) || H <= 0 || slopeHoverL <= 0) return m(0);
  return m(H / slopeHoverL);
}

/**
 * Peak global surface-temperature anomaly (K, negative = cooling)
 * following a VEI-based stratospheric-aerosol scaling inspired by:
 *   Robock, A. (2000). "Volcanic eruptions and climate." Reviews of
 *    Geophysics 38 (2): 191–219. DOI: 10.1029/1998RG000054.
 *   Sato, M., Hansen, J. E., McCormick, M. P. & Pollack, J. B. (1993).
 *    "Stratospheric aerosol optical depths, 1850–1990." J. Geophys.
 *    Res. 98 (D12): 22987–22994.
 *   Toohey, M. & Sigl, M. (2017). "Volcanic stratospheric sulfur
 *    injections and aerosol optical depth from 500 BCE to 1900 CE."
 *    Earth System Science Data 9 (2): 809–831.
 *    DOI: 10.5194/essd-9-809-2017.
 *
 * Empirical anchors and what this formula returns at each one:
 *
 *   VEI  Event           Observed ΔT      Formula ΔT      Δ%
 *   5    El Chichón 1982  −0.3 K           −0.24 K         −20 %
 *   6    Pinatubo 1991    −0.5 K           −0.53 K         + 6 %
 *   6    Krakatau 1883    −0.55 K          −0.53 K         − 4 %
 *   7    Tambora 1815     −1.5 K           −1.17 K         −22 %
 *   8    Toba (model)     −3 to −5 K       −2.58 K (cap)   − 14…48 %
 *
 * Calibration: ΔT(VEI) = max(−5, −0.05 · 2.2^(VEI − 3)) K.
 *   - The 2.2× per-VEI rate (instead of 2×) better fits the observed
 *     Pinatubo→Tambora ratio of ≈ 3 across one VEI step.
 *   - Hard saturation at −5 K reflects the physical fact that
 *     stratospheric aerosol coalesces and sediments faster as mass
 *     increases — past Tambora-class injections, additional SO₂ does
 *     not produce proportionally more cooling (Robock 2000 §5.2).
 *
 * Same-VEI variance: real events at the same VEI can differ ~2× in
 * ΔT depending on stratospheric SO₂ injection (Krakatau 1883 ≈ 35 Tg
 * vs Pinatubo 1991 ≈ 17 Tg, both VEI 6). The simulator's published
 * ±70 % confidence band on this field is the right place to read
 * that variability, not the point estimate.
 */
export function climateCoolingFromVEI(vei: number): number {
  if (!Number.isFinite(vei) || vei < 1) return 0;
  return Math.max(-5, -0.05 * Math.pow(2.2, vei - 3));
}

/**
 * Approximate area (m²) inside the 1 mm ashfall isopach for a given
 * total bulk ejecta volume. Simplified Walker (1980) / Pyle (1989)
 * isopach scaling:
 *
 *     Area(1 mm) ≈ C · V^0.8     (V in km³, Area in km²)
 *
 * with C ≈ 3 × 10³ km²·km⁻²·⁴. Order-of-magnitude only; real
 * fallout is wind-shaped and requires HYSPLIT-like Lagrangian
 * advection for a realistic footprint.
 */
export function ashfallArea1mm(totalEjectaVolume: number): number {
  if (!Number.isFinite(totalEjectaVolume) || totalEjectaVolume <= 0) return 0;
  const V_km3 = totalEjectaVolume / 1e9;
  // Phase 10 audit: prefactor 3 000 under-predicted by factor 25
  // (Pinatubo 1991 sim 19 000 km² vs lit 500 000 km²). Re-fit against
  // Pyle 1989 / Bonadonna & Costa 2013 isopach datasets:
  //   MSH 1980 (V≈1 km³) → 50 000 km² observed
  //   Pinatubo 1991 (V≈10 km³) → 500 000 km² observed
  //   Krakatau 1883 (V≈20 km³) → ~1×10⁶ km² observed
  // K = 60 000 fits all three within ±factor-2. Old prefactor was a
  // typo — the published Pyle 1989 fit is K ≈ 5×10⁴, not 3×10³.
  const areaKm2 = 60_000 * Math.pow(V_km3, 0.8);
  return areaKm2 * 1_000_000; // km² → m²
}

/**
 * Approximate lahar (debris-flow) runout distance for a given lahar
 * total volume. Iverson (1997) / Vallance & Iverson (2015) empirical
 * volume–runout scaling for saturated mud-and-debris flows:
 *
 *     L_km ≈ 0.05 · V_m3^0.38
 *
 * Reproduces Mt St. Helens 1980 (V ≈ 5 × 10⁷ m³ → L ≈ 50 km observed)
 * within a factor of 2. The Iverson-style band has wide (±factor 2)
 * scatter around the fit.
 *
 * Reference: Vallance, J. W. & Iverson, R. M. (2015). "Lahars and
 * their deposits." In Encyclopedia of Volcanoes (2nd ed.),
 * pp. 649–664. Academic Press / Elsevier.
 */
export function laharRunout(laharVolumeM3: number): Meters {
  if (!Number.isFinite(laharVolumeM3) || laharVolumeM3 <= 0) return m(0);
  const L_km = 0.05 * Math.pow(laharVolumeM3, 0.38);
  return m(L_km * 1_000);
}

/**
 * Volcanic Explosivity Index (VEI) — an integer 0–8 assigned to an
 * explosive eruption by its bulk ejecta volume, per the original
 * Newhall & Self (1982) classification.
 *
 *   VEI 0  : V <  10⁴ m³        "non-explosive", Hawaiian
 *   VEI 1  : 10⁴ ≤ V < 10⁶ m³    "gentle",   Strombolian
 *   VEI 2  : 10⁶ ≤ V < 10⁷ m³    "explosive"
 *   VEI 3  : 10⁷ ≤ V < 10⁸ m³    "severe"
 *   VEI 4  : 10⁸ ≤ V < 10⁹ m³    "cataclysmic"
 *   VEI 5  : 10⁹ ≤ V < 10¹⁰ m³   "paroxysmic" (Mt St Helens 1980)
 *   VEI 6  : 10¹⁰ ≤ V < 10¹¹ m³  "colossal"   (Krakatoa 1883)
 *   VEI 7  : 10¹¹ ≤ V < 10¹² m³  "super-colossal" (Tambora 1815)
 *   VEI 8  : V ≥ 10¹² m³         "mega-colossal" (Toba ≈74 ka)
 *
 * Bulk volumes include pore space (deposited tephra). Callers holding
 * DRE figures should multiply by ≈ 2.5 before calling this function.
 *
 * Source: Newhall & Self (1982), "The Volcanic Explosivity Index (VEI):
 * An estimate of explosive magnitude for historical volcanism",
 * J. Geophys. Res. 87(C2), pp. 1231–1238.
 * DOI: 10.1029/JC087iC02p01231.
 */
export function volcanicExplosivityIndex(ejectaVolumeM3: number): number {
  if (!Number.isFinite(ejectaVolumeM3) || ejectaVolumeM3 < 0) {
    throw new Error(
      `VEI: ejectaVolumeM3 must be a non-negative number (got ${String(ejectaVolumeM3)})`
    );
  }
  if (ejectaVolumeM3 < 1e4) return 0;
  if (ejectaVolumeM3 < 1e6) return 1;
  const logV = Math.log10(ejectaVolumeM3);
  const vei = Math.floor(logV) - 4;
  return Math.min(8, Math.max(2, vei));
}

/**
 * Lower-bound ejecta volume (m³) for a given VEI level, useful when
 * rendering the "what VEI would this be?" legend alongside the preset
 * gallery. VEI 0's lower bound is 0 by convention.
 */
export function vEILowerBoundVolume(vei: number): number {
  const clamped = Math.max(0, Math.min(8, Math.floor(vei)));
  if (clamped === 0) return 0;
  if (clamped === 1) return 1e4;
  return 10 ** (clamped + 4);
}

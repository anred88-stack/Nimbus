import type { ExceedanceProbability } from '../physics/uq/ecdf.js';

/**
 * Radial ECDF bitmap — Phase 8c probability-driven ring rendering.
 *
 * Builds a square HTMLCanvasElement where the alpha channel at every
 * pixel is proportional to P(R ≥ distance_from_centre), with R drawn
 * from the Monte-Carlo ensemble's ECDF. The result is meant to be
 * attached to a Cesium Rectangle entity sized 2·R_max × 2·R_max in
 * ground-range metres, centred on the source — Cesium maps the
 * canvas onto the geographic rectangle with bilinear filtering.
 *
 * What the user sees:
 *   - At the source: alpha ≈ 1 (every realisation reaches r = 0).
 *   - At the median radius: alpha ≈ 0.5 (half the realisations
 *     reach this far).
 *   - At the maximum sample: alpha ≈ 1/N (only the worst
 *     realisation reaches this far — an honest "rare-tail" fade).
 *
 * The colour is solid throughout — only alpha varies. This lets the
 * existing damage-ring outlines stay sharp on top: the heatmap
 * underlay shows the probability gradient, the outline marks the
 * best-estimate (P50) reference. Together they convey "darker =
 * very likely, fading = rare worst case" in one glance.
 *
 * The 256-step radial ramp matches the proposal exactly: we sample
 * the ECDF at 256 evenly-spaced distances and write the resulting
 * alpha column. Since the bitmap is rotationally symmetric we only
 * compute one quadrant and mirror.
 */

export interface RadialEcdfBitmapOptions {
  /** Square edge size in pixels. Default 256 — the ramp resolution
   *  agreed in the proposal. */
  size?: number;
  /** Maximum alpha (at the source). Default 0.55 to leave the OSM
   *  imagery legible underneath. */
  maxAlpha?: number;
  /** Colour as [R, G, B] in [0, 255]. Default off-white so the
   *  heatmap reads as a generic "this is a probability halo"
   *  without competing with the per-ring tier colour. */
  rgb?: readonly [number, number, number];
}

export interface RadialEcdfBitmap {
  canvas: HTMLCanvasElement;
  /** Half-edge size (m) — the maximum radius the canvas covers,
   *  i.e. the largest sample. Caller uses this to size the Cesium
   *  Rectangle. */
  halfEdgeMeters: number;
}

/**
 * Render an ECDF-driven radial alpha bitmap.
 *
 * The canvas spans [-halfEdge, +halfEdge] in both ground-range
 * dimensions where halfEdge = max(samples). Each pixel's alpha is
 * `maxAlpha × P(R ≥ pixelDistance)`.
 */
export function renderRadialEcdfBitmap(
  ecdf: ExceedanceProbability,
  options: RadialEcdfBitmapOptions = {}
): RadialEcdfBitmap | null {
  if (ecdf.sortedSamples.length === 0) return null;
  const size = options.size ?? 256;
  const maxAlpha = options.maxAlpha ?? 0.55;
  const [r, g, b] = options.rgb ?? [255, 255, 255];

  const halfEdgeMeters = ecdf.sortedSamples[ecdf.sortedSamples.length - 1] ?? 0;
  if (halfEdgeMeters <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('renderRadialEcdfBitmap: 2D context unavailable');

  const img = ctx.createImageData(size, size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  // Pre-compute the 256-step radial alpha lookup. Each entry
  // corresponds to a discrete distance bucket at fractional radius
  // i / (size/2).
  const halfSize = size / 2;
  const alphaByBucket = new Uint8ClampedArray(halfSize + 1);
  for (let i = 0; i <= halfSize; i++) {
    const fracRadius = i / halfSize; // 0 → 1
    const distMeters = fracRadius * halfEdgeMeters;
    const p = ecdf.exceedanceAt(distMeters);
    alphaByBucket[i] = Math.round(p * maxAlpha * 255);
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const distFrac = Math.sqrt(dx * dx + dy * dy) / halfSize;
      const base = (py * size + px) * 4;
      if (distFrac >= 1) {
        img.data[base + 3] = 0;
        continue;
      }
      const bucket = Math.min(halfSize, Math.round(distFrac * halfSize));
      const a = alphaByBucket[bucket] ?? 0;
      img.data[base] = r;
      img.data[base + 1] = g;
      img.data[base + 2] = b;
      img.data[base + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, halfEdgeMeters };
}

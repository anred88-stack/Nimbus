/**
 * Dense 2D scalar-field → bitmap renderer for the globe. Turns a
 * Float32Array (tsunami arrival times, ashfall thickness, PGA field,
 * …) into an OffscreenCanvas-backed ImageBitmap that Cesium can
 * attach to a Rectangle entity as an ImageMaterialProperty.
 *
 * Two built-in colormaps (viridis, inferno) are provided as
 * 256-entry lookup tables because matplotlib's palette is both
 * perceptually uniform and scientifically standard. We hard-code
 * them to avoid shipping d3-scale for a few KB of RGB.
 *
 * References:
 *   van der Walt, Smith (2015). "A Better Default Colormap for
 *    Matplotlib." SciPy 2015 — viridis design rationale.
 *   Lorensen & Cline (1987) — marching squares heritage.
 */

/** Stock viridis 256-entry LUT (simplified 16-stop interpolation
 *  sufficient for pixel-scale perceptual uniformity). */
const VIRIDIS_STOPS: readonly (readonly [number, number, number])[] = [
  [68, 1, 84],
  [71, 19, 101],
  [72, 40, 120],
  [69, 55, 129],
  [64, 70, 136],
  [57, 86, 140],
  [49, 104, 142],
  [42, 120, 142],
  [35, 137, 142],
  [31, 154, 138],
  [32, 172, 133],
  [52, 192, 121],
  [84, 210, 105],
  [132, 226, 84],
  [185, 233, 60],
  [253, 231, 37],
];

/** Inferno LUT — warm-tone palette for the more dramatic hazards. */
const INFERNO_STOPS: readonly (readonly [number, number, number])[] = [
  [0, 0, 3],
  [12, 7, 35],
  [31, 12, 72],
  [57, 9, 99],
  [84, 12, 109],
  [109, 17, 110],
  [134, 28, 106],
  [160, 39, 99],
  [185, 50, 87],
  [207, 66, 73],
  [224, 88, 55],
  [236, 114, 36],
  [244, 143, 20],
  [249, 172, 18],
  [246, 204, 43],
  [252, 255, 164],
];

export type Colormap = 'viridis' | 'inferno';

/**
 * Discrete band: when present in {@link HeatmapOptions}, replaces the
 * continuous {@link Colormap} sampling with a lookup-table colour
 * decision keyed on the absolute scalar value. Used for the tsunami
 * amplitude visualisation, where the user-facing semantics are
 * "1–3 m wave-front, 3–6 m wave-front, …" — i.e. the colour at a given
 * pixel must encode the absolute wave height in metres, not a
 * normalised position inside the field's dynamic range.
 *
 * Bands MUST be sorted ascending by `minValue`. The renderer assigns a
 * cell to the band with the largest `minValue` that is ≤ the cell's
 * value; cells below the first band's `minValue` are fully transparent.
 */
export interface DiscreteBand {
  minValue: number;
  rgb: readonly [number, number, number];
}

/**
 * NOAA-standard tsunami-amplitude bands, restricted to ≥ 1 m so the
 * map only highlights waves in the "felt / damaging / catastrophic"
 * regime — sub-metre amplitudes are physically real but visually
 * indistinguishable from natural ocean swell on a global view, and
 * the user explicitly asked to start the rendering from 1 m so the
 * mapping reads as a tsunami map, not a gentle-wave map.
 *
 *   1–3  m  → green  (felt, possible coastal flooding)
 *   3–6  m  → yellow (damaging)
 *   6–10 m  → orange (severe)
 *   >10  m  → red    (catastrophic / mega-tsunami)
 */
export const WAVE_AMPLITUDE_BANDS: readonly DiscreteBand[] = [
  { minValue: 1, rgb: [95, 197, 94] },
  { minValue: 3, rgb: [244, 208, 63] },
  { minValue: 6, rgb: [230, 126, 34] },
  { minValue: 10, rgb: [192, 57, 43] },
];

function stopsFor(name: Colormap): readonly (readonly [number, number, number])[] {
  return name === 'inferno' ? INFERNO_STOPS : VIRIDIS_STOPS;
}

/** Sample a 16-stop colormap at t ∈ [0, 1]. */
function sampleColormap(t: number, name: Colormap): [number, number, number] {
  const stops = stopsFor(name);
  const clamped = Math.max(0, Math.min(1, t));
  const pos = clamped * (stops.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  const first = stops[0];
  if (first === undefined) return [0, 0, 0];
  const c0 = stops[i] ?? first;
  const c1 = stops[Math.min(i + 1, stops.length - 1)] ?? c0;
  return [
    c0[0] + frac * (c1[0] - c0[0]),
    c0[1] + frac * (c1[1] - c0[1]),
    c0[2] + frac * (c1[2] - c0[2]),
  ];
}

export interface HeatmapOptions {
  /** Lower value mapped to the coolest colormap stop (defaults to
   *  the field's min). */
  valueMin?: number;
  /** Upper value mapped to the warmest stop (defaults to the field's
   *  max). */
  valueMax?: number;
  /** Colormap palette. Defaults to 'viridis'. */
  colormap?: Colormap;
  /** Opacity applied to every rendered pixel [0, 1]. Defaults to 0.55
   *  so the base OSM tiles stay visible underneath. */
  opacity?: number;
  /** Value to treat as "transparent" (e.g. Infinity for unreachable
   *  tsunami cells, 0 for no-deposit ashfall pixels). */
  transparentBelow?: number;
  /** Stride sampling factor. When > 1, the canvas is rendered at
   *  (nLon/d) × (nLat/d) pixels and Cesium stretches it back to the
   *  full geographic rectangle. Cuts main-thread render time by d².
   *  Defaults to 1 (full resolution). */
  downsample?: number;
  /** When set, replaces {@link colormap} sampling with absolute-value
   *  band lookup (see {@link DiscreteBand}). Cells with value below
   *  the first band's `minValue` are fully transparent. */
  discreteBands?: readonly DiscreteBand[];
}

export interface HeatmapResult {
  /** HTMLCanvasElement — directly compatible with Cesium's
   *  `ImageMaterialProperty` without a further bitmap conversion. */
  canvas: HTMLCanvasElement;
  /** Value that mapped to the coolest colour (echoed for caller
   *  legend rendering). */
  valueMin: number;
  /** Value that mapped to the warmest colour. */
  valueMax: number;
}

/**
 * Auto-detect value-range bounds for a sparse scalar field. Ignores
 * NaN / Infinity and values at or below `transparentBelow`. Pure —
 * unit-testable in jsdom without a canvas.
 */
export function computeValueRange(
  samples: Float32Array,
  transparentBelow: number = Number.NEGATIVE_INFINITY,
  valueMin?: number,
  valueMax?: number
): { valueMin: number; valueMax: number } {
  let vMin = valueMin ?? Number.POSITIVE_INFINITY;
  let vMax = valueMax ?? Number.NEGATIVE_INFINITY;
  if (valueMin === undefined || valueMax === undefined) {
    for (const v of samples) {
      if (!Number.isFinite(v) || v <= transparentBelow) continue;
      if (valueMin === undefined && v < vMin) vMin = v;
      if (valueMax === undefined && v > vMax) vMax = v;
    }
  }
  if (!Number.isFinite(vMin) || !Number.isFinite(vMax) || vMax <= vMin) {
    return { valueMin: 0, valueMax: 0 };
  }
  return { valueMin: vMin, valueMax: vMax };
}

/**
 * Render a dense 2D scalar field as a coloured canvas. Grid layout:
 * row-major north-to-south, so `samples[i * nLon + j]` is the cell
 * at row i (from north) and column j (from west) — same convention
 * as {@link ElevationGrid}. Synchronous: the entire pass is a single
 * putImageData, so there's no async win here.
 */
export function renderScalarFieldHeatmap(
  samples: Float32Array,
  nLat: number,
  nLon: number,
  options: HeatmapOptions = {}
): HeatmapResult {
  const opacity = options.opacity ?? 0.55;
  const colormap = options.colormap ?? 'viridis';
  const transparentBelow = options.transparentBelow ?? Number.NEGATIVE_INFINITY;
  const discreteBands = options.discreteBands;
  const bandMinValue = discreteBands !== undefined ? (discreteBands[0]?.minValue ?? 0) : null;
  // Phase 12b — downsample factor. When > 1, the heatmap canvas is
  // rendered at (nLon / d) × (nLat / d) pixels, sampling the source
  // field via stride-d nearest-neighbour reads. The output canvas is
  // then stretched by Cesium when attached to the rectangle, so the
  // visible coverage is unchanged — only the per-pixel cost on the
  // main thread drops by d² (factor 4 at d=2, factor 16 at d=4). Used
  // for the 1024² global tsunami heatmap to keep main-thread render
  // under 50 ms; the local high-res tile keeps d=1 for sub-km detail.
  const downsample = Math.max(1, Math.floor(options.downsample ?? 1));

  const { valueMin: vMin, valueMax: vMax } = computeValueRange(
    samples,
    transparentBelow,
    options.valueMin,
    options.valueMax
  );

  const outNLat = Math.max(1, Math.floor(nLat / downsample));
  const outNLon = Math.max(1, Math.floor(nLon / downsample));

  const canvas = document.createElement('canvas');
  canvas.width = outNLon;
  canvas.height = outNLat;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('renderScalarFieldHeatmap: 2D context unavailable');

  if (vMin === 0 && vMax === 0) {
    // Degenerate field — return a fully transparent canvas.
    return { canvas, valueMin: 0, valueMax: 0 };
  }

  const img = ctx.createImageData(outNLon, outNLat);
  const range = vMax - vMin;
  const alpha = Math.round(opacity * 255);
  for (let oi = 0; oi < outNLat; oi++) {
    const sourceI = oi * downsample;
    for (let oj = 0; oj < outNLon; oj++) {
      const sourceJ = oj * downsample;
      const v = samples[sourceI * nLon + sourceJ] ?? Number.NaN;
      const base = (oi * outNLon + oj) * 4;
      if (!Number.isFinite(v) || v <= transparentBelow) {
        img.data[base + 3] = 0;
        continue;
      }
      let r: number;
      let g: number;
      let b: number;
      if (discreteBands !== undefined && bandMinValue !== null) {
        // Below the lowest band's minValue → fully transparent. The
        // tsunami visualisation uses this to keep ocean swell-scale
        // amplitudes (< 1 m) from painting the whole open ocean.
        if (v < bandMinValue) {
          img.data[base + 3] = 0;
          continue;
        }
        // Pick the highest band whose minValue is still ≤ v.
        let chosen = discreteBands[0]?.rgb;
        for (const band of discreteBands) {
          if (v >= band.minValue) chosen = band.rgb;
          else break;
        }
        if (chosen === undefined) {
          img.data[base + 3] = 0;
          continue;
        }
        [r, g, b] = chosen;
      } else {
        const t = Math.max(0, Math.min(1, (v - vMin) / range));
        [r, g, b] = sampleColormap(t, colormap);
      }
      img.data[base] = r;
      img.data[base + 1] = g;
      img.data[base + 2] = b;
      img.data[base + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, valueMin: vMin, valueMax: vMax };
}

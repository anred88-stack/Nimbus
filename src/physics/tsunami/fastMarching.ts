import { STANDARD_GRAVITY } from '../constants.js';
import type { ElevationGrid } from '../elevation/index.js';

/**
 * Fast Marching Method (FMM) solver for the shallow-water tsunami
 * arrival-time field on a bathymetric grid.
 *
 *   |∇T|² = 1 / c(x, y)²           (the eikonal equation)
 *   c(x, y) = √(g · h(x, y))        (Lamb 1932 shallow-water celerity)
 *
 * Given a source point and an elevation grid (ocean = negative
 * elevation), FMM walks outward from the source in strictly
 * non-decreasing arrival-time order, solving a quadratic upwind
 * update at every trial node against its already-known neighbours.
 * Landlocked or dry cells (elevation ≥ 0) are inaccessible — the
 * tsunami can't propagate through dry land. This produces the
 * familiar bent-contour isochrones that NOAA's WC/ATWC uses for
 * tsunami-arrival bulletins.
 *
 * References:
 *   Sethian, J. A. (1996). "A fast marching level set method for
 *    monotonically advancing fronts." Proc. Natl. Acad. Sci. 93 (4),
 *    1591–1595. DOI: 10.1073/pnas.93.4.1591.
 *   Satake, K. (2014). "Advances in earthquake and tsunami sciences
 *    and disaster risk reduction since the 2004 Indian Ocean
 *    tsunami." Geoscience Letters 1, 15.
 *    (Discusses operational tsunami isochrone products built on
 *    eikonal-solver technology.)
 *
 * Implementation notes:
 *   - Grid nodes carry one of three states: FAR (unvisited), TRIAL
 *     (in the min-heap, tentative time), KNOWN (finalised).
 *   - The heap is a flat-array binary min-heap indexed by the node
 *     flat index; `heapPos[idx] = position` lets us update an entry
 *     in O(log N) when a better tentative time is found.
 *   - Spacing between grid nodes is computed per latitude to account
 *     for the Earth's curvature: Δ_east = Δ_lon · (2π R / 360) · cos(lat).
 *   - Arrival time at dry cells is +∞; callers should treat ∞ as
 *     "unreachable" and not render a contour through the cell.
 */

const FAR = 0;
const TRIAL = 1;
const KNOWN = 2;

/** Earth mean radius (m), matching src/physics/earthScale.ts. */
const EARTH_RADIUS_M = 6_371_000;

export interface FastMarchingInput {
  /** Bathymetric grid: negative elevation = ocean (depth = −elev), non-negative = land. */
  grid: ElevationGrid;
  /** Source latitude (°, WGS84). Must lie inside the grid bounds. */
  sourceLatitude: number;
  /** Source longitude (°, WGS84). Must lie inside the grid bounds. */
  sourceLongitude: number;
  /** Minimum ocean depth (m) to treat as water. Defaults to 10 m —
   *  the simulator refuses to propagate through the near-shore where
   *  the shallow-water approximation breaks down anyway. */
  minDepthMeters?: number;
  /** Surface gravity (m/s²). Defaults to Earth standard. */
  surfaceGravity?: number;
}

export interface FastMarchingResult {
  /** Arrival time from the source (s) at each grid node, row-major
   *  north-to-south. Infinity at unreachable cells (land or too
   *  shallow for the shallow-water approximation). */
  arrivalTimes: Float32Array;
  /** Latitude axis length, echoed from the input grid. */
  nLat: number;
  /** Longitude axis length, echoed from the input grid. */
  nLon: number;
  /** Number of cells that were marked KNOWN by the march (i.e.
   *  reachable from the source). Useful for sanity tests. */
  reachableCount: number;
}

/**
 * Solve a quadratic update at node (i, j), using the best arrival
 * time from the already-KNOWN east-west and north-south neighbours.
 * Returns the candidate arrival time for that node.
 *
 *   (T − Tx)² / dx² + (T − Ty)² / dy² = 1 / c²
 *
 * If only one of (Tx, Ty) is available (the other neighbour is dry
 * or out of bounds), the upwind update collapses to a 1-D step:
 *
 *   T = Tx + dx / c     (or T = Ty + dy / c)
 */
function quadraticUpdate(
  tEast: number,
  tWest: number,
  tNorth: number,
  tSouth: number,
  dxEast: number,
  dxWest: number,
  dxNorth: number,
  dxSouth: number,
  c: number
): number {
  // Best neighbour in each axis (minimum of east/west and north/south).
  let tx = Infinity;
  let dx = 0;
  if (tEast < tWest) {
    tx = tEast;
    dx = dxEast;
  } else if (tWest < tEast) {
    tx = tWest;
    dx = dxWest;
  }
  let ty = Infinity;
  let dy = 0;
  if (tNorth < tSouth) {
    ty = tNorth;
    dy = dxNorth;
  } else if (tSouth < tNorth) {
    ty = tSouth;
    dy = dxSouth;
  }

  const inv = 1 / c;
  // 1-D falls back to upwind step.
  if (!Number.isFinite(tx) && !Number.isFinite(ty)) return Infinity;
  if (!Number.isFinite(tx)) return ty + dy * inv;
  if (!Number.isFinite(ty)) return tx + dx * inv;
  // 2-D quadratic: solve a·T² − 2·b·T + c₀ = 1/c² for T.
  const a = 1 / (dx * dx) + 1 / (dy * dy);
  const b = tx / (dx * dx) + ty / (dy * dy);
  const c0 = (tx * tx) / (dx * dx) + (ty * ty) / (dy * dy) - inv * inv;
  const disc = b * b - a * c0;
  if (disc < 0) {
    // Neighbours disagree too much — fall back to the better 1-D step.
    const tx1 = tx + dx * inv;
    const ty1 = ty + dy * inv;
    return Math.min(tx1, ty1);
  }
  return (b + Math.sqrt(disc)) / a;
}

/**
 * Minimal binary min-heap keyed by arrival time. Values are flat
 * grid indices; `heapPos[idx]` gives the current heap position so
 * we can decreaseKey a tentative time in O(log N).
 */
class TimeHeap {
  private readonly data: number[] = []; // flat indices in heap order
  private readonly heapPos: Int32Array;
  private readonly times: Float32Array;

  constructor(nCells: number, times: Float32Array) {
    this.heapPos = new Int32Array(nCells).fill(-1);
    this.times = times;
  }

  get size(): number {
    return this.data.length;
  }

  push(idx: number): void {
    this.data.push(idx);
    this.heapPos[idx] = this.data.length - 1;
    this.bubbleUp(this.data.length - 1);
  }

  popMin(): number {
    const top = this.data[0];
    if (top === undefined) throw new Error('TimeHeap.popMin: heap is empty');
    const last = this.data.pop();
    this.heapPos[top] = -1;
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last;
      this.heapPos[last] = 0;
      this.bubbleDown(0);
    }
    return top;
  }

  decreaseKey(idx: number): void {
    const pos = this.heapPos[idx];
    if (pos === undefined || pos < 0) return;
    this.bubbleUp(pos);
  }

  private readTime(flatIdx: number): number {
    return this.times[flatIdx] ?? Infinity;
  }

  private bubbleUp(pos: number): void {
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      const a = this.data[pos];
      const b = this.data[parent];
      if (a === undefined || b === undefined) break;
      if (this.readTime(a) < this.readTime(b)) {
        this.swap(pos, parent);
        pos = parent;
      } else break;
    }
  }

  private bubbleDown(pos: number): void {
    const n = this.data.length;
    for (;;) {
      const l = 2 * pos + 1;
      const r = 2 * pos + 2;
      let best = pos;
      const bIdx = this.data[best];
      if (bIdx === undefined) break;
      let bestTime = this.readTime(bIdx);
      if (l < n) {
        const lIdx = this.data[l];
        if (lIdx !== undefined && this.readTime(lIdx) < bestTime) {
          best = l;
          bestTime = this.readTime(lIdx);
        }
      }
      if (r < n) {
        const rIdx = this.data[r];
        if (rIdx !== undefined && this.readTime(rIdx) < bestTime) {
          best = r;
          bestTime = this.readTime(rIdx);
        }
      }
      if (best === pos) return;
      this.swap(pos, best);
      pos = best;
    }
  }

  private swap(a: number, b: number): void {
    const x = this.data[a];
    const y = this.data[b];
    if (x === undefined || y === undefined) return;
    this.data[a] = y;
    this.data[b] = x;
    this.heapPos[y] = a;
    this.heapPos[x] = b;
  }
}

/**
 * Run Fast Marching from the source point across the grid. Returns
 * the arrival-time field; Infinity at unreachable cells.
 *
 * Complexity: O(N log N) for an N-cell grid. On a 200×200 regional
 * grid (40 000 cells) this is ~1 ms in V8; on a 1 200×600 global
 * grid (720 000 cells) it is ~50–100 ms — well within a single
 * frame budget if wrapped in a Comlink worker.
 */
export function computeTsunamiArrivalField(input: FastMarchingInput): FastMarchingResult {
  const { grid, sourceLatitude, sourceLongitude } = input;
  const g = input.surfaceGravity ?? STANDARD_GRAVITY;
  const minDepth = input.minDepthMeters ?? 10;
  const { nLat, nLon, minLat, maxLat, minLon, maxLon, samples } = grid;
  const nCells = nLat * nLon;

  const arrivalTimes = new Float32Array(nCells);
  arrivalTimes.fill(Infinity);
  const state = new Uint8Array(nCells); // FAR by default

  // Pre-compute per-row east-west spacing (depends on latitude).
  const dLatDeg = (maxLat - minLat) / (nLat - 1);
  const dLonDeg = (maxLon - minLon) / (nLon - 1);
  const metersPerDeg = (EARTH_RADIUS_M * Math.PI) / 180;
  const dyMeters = dLatDeg * metersPerDeg; // constant
  const dxMetersPerRow = new Float32Array(nLat);
  for (let i = 0; i < nLat; i++) {
    const lat = maxLat - i * dLatDeg; // row 0 is the north boundary
    dxMetersPerRow[i] = dLonDeg * metersPerDeg * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  }

  // Convert source lat/lon to grid indices (clamped, nearest cell).
  const sourceI = Math.max(
    0,
    Math.min(nLat - 1, Math.round(((maxLat - sourceLatitude) / (maxLat - minLat)) * (nLat - 1)))
  );
  const sourceJ = Math.max(
    0,
    Math.min(nLon - 1, Math.round(((sourceLongitude - minLon) / (maxLon - minLon)) * (nLon - 1)))
  );
  const sourceIdx = sourceI * nLon + sourceJ;

  // Source cell is KNOWN @ time 0 regardless of its elevation — the
  // tsunami starts there. If the source is on dry land the wave can
  // still radiate into the adjacent ocean cells.
  arrivalTimes[sourceIdx] = 0;
  state[sourceIdx] = KNOWN;

  const heap = new TimeHeap(nCells, arrivalTimes);

  /** Speed at (i, j). Returns 0 for dry or too-shallow cells. */
  const speedAt = (i: number, j: number): number => {
    const idx = i * nLon + j;
    const elev = samples[idx] ?? 0;
    const depth = -elev;
    if (depth < minDepth) return 0;
    return Math.sqrt(g * depth);
  };

  /** Insert or update a trial neighbour (i, j) from the set of
   *  currently KNOWN cells. */
  const visit = (i: number, j: number): void => {
    if (i < 0 || i >= nLat || j < 0 || j >= nLon) return;
    const idx = i * nLon + j;
    if (state[idx] === KNOWN) return;
    const c = speedAt(i, j);
    if (c <= 0) {
      state[idx] = KNOWN; // finalise as unreachable (∞)
      return;
    }
    const readTime = (flatIdx: number): number => arrivalTimes[flatIdx] ?? Infinity;
    const tEast =
      j + 1 < nLon && state[i * nLon + j + 1] === KNOWN ? readTime(i * nLon + j + 1) : Infinity;
    const tWest =
      j - 1 >= 0 && state[i * nLon + j - 1] === KNOWN ? readTime(i * nLon + j - 1) : Infinity;
    const tNorth =
      i - 1 >= 0 && state[(i - 1) * nLon + j] === KNOWN ? readTime((i - 1) * nLon + j) : Infinity;
    const tSouth =
      i + 1 < nLat && state[(i + 1) * nLon + j] === KNOWN ? readTime((i + 1) * nLon + j) : Infinity;
    const dxRow = dxMetersPerRow[i] ?? dyMeters;
    const tNew = quadraticUpdate(tEast, tWest, tNorth, tSouth, dxRow, dxRow, dyMeters, dyMeters, c);
    const currentTime = arrivalTimes[idx] ?? Infinity;
    if (tNew < currentTime) {
      arrivalTimes[idx] = tNew;
      if (state[idx] === FAR) {
        state[idx] = TRIAL;
        heap.push(idx);
      } else {
        heap.decreaseKey(idx);
      }
    }
  };

  // Seed the heap with the source's neighbours.
  visit(sourceI - 1, sourceJ);
  visit(sourceI + 1, sourceJ);
  visit(sourceI, sourceJ - 1);
  visit(sourceI, sourceJ + 1);

  let reachableCount = 1; // the source itself
  while (heap.size > 0) {
    const idx = heap.popMin();
    if (state[idx] === KNOWN) continue;
    state[idx] = KNOWN;
    if (Number.isFinite(arrivalTimes[idx] ?? Infinity)) reachableCount++;
    const i = Math.floor(idx / nLon);
    const j = idx - i * nLon;
    visit(i - 1, j);
    visit(i + 1, j);
    visit(i, j - 1);
    visit(i, j + 1);
  }

  return { arrivalTimes, nLat, nLon, reachableCount };
}

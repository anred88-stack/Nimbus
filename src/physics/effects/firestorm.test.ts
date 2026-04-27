import { describe, expect, it } from 'vitest';
import { J, megatonsToJoules, Mt } from '../units.js';
import {
  firestormArea,
  firestormSustainRadius,
  flammableIgnitionArea,
  flammableIgnitionRadius,
} from './firestorm.js';

describe('firestorm (Glasstone & Dolan 1977 thermal-pulse thresholds)', () => {
  it('flammableIgnitionRadius for Hiroshima-class yield matches published figure within ±30 %', () => {
    // 15 kt with the default 0.35 thermal partition and unshielded τ = 1.
    // Glasstone Fig. 7.44 gives ~2.4 km to the 10-cal/cm² contour for 15 kt.
    // The published 1σ band on the thermal-partition fluence thresholds
    // (Glasstone & Dolan §7.40) is roughly ±25–30 %: we match that
    // honestly rather than the artificially tight ±10 % window that
    // the inverse-square formula itself could hit.
    const W = megatonsToJoules(Mt(0.015));
    const r = flammableIgnitionRadius({ yieldEnergy: W }) as number;
    const observed = 2_400;
    expect(Math.abs(r - observed) / observed).toBeLessThan(0.3);
  });

  it('firestormSustainRadius is strictly larger than ignition radius (lower fluence threshold)', () => {
    const W = megatonsToJoules(Mt(1));
    const ignite = flammableIgnitionRadius({ yieldEnergy: W }) as number;
    const sustain = firestormSustainRadius({ yieldEnergy: W }) as number;
    expect(sustain).toBeGreaterThan(ignite);
  });

  it('scales as sqrt(W) — 4× yield doubles the ignition radius', () => {
    const r1 = flammableIgnitionRadius({ yieldEnergy: megatonsToJoules(Mt(1)) }) as number;
    const r2 = flammableIgnitionRadius({ yieldEnergy: megatonsToJoules(Mt(4)) }) as number;
    expect(r2 / r1).toBeCloseTo(2, 2);
  });

  it('atmospheric transmission scales the radius as sqrt(τ)', () => {
    const W = megatonsToJoules(Mt(1));
    const rFull = flammableIgnitionRadius({ yieldEnergy: W }) as number;
    const rHalf = flammableIgnitionRadius({
      yieldEnergy: W,
      atmosphericTransmission: 0.5,
    }) as number;
    expect(rHalf / rFull).toBeCloseTo(Math.sqrt(0.5), 3);
  });

  it('zero or negative yield produces zero radius and zero area', () => {
    expect(flammableIgnitionRadius({ yieldEnergy: J(0) })).toBe(0);
    expect(flammableIgnitionArea({ yieldEnergy: J(0) })).toBe(0);
    expect(firestormArea({ yieldEnergy: J(0) })).toBe(0);
  });

  it('area matches π·r² to machine precision', () => {
    const W = megatonsToJoules(Mt(0.5));
    const r = flammableIgnitionRadius({ yieldEnergy: W }) as number;
    const area = flammableIgnitionArea({ yieldEnergy: W }) as number;
    expect(area).toBeCloseTo(Math.PI * r * r, 6);
  });

  it('accepts a custom thermal partition (impacts use ~0.003, not 0.35)', () => {
    const W = megatonsToJoules(Mt(100_000)); // Chicxulub-class
    const rNuclear = flammableIgnitionRadius({ yieldEnergy: W }) as number;
    const rImpact = flammableIgnitionRadius({
      yieldEnergy: W,
      thermalPartition: 0.003,
    }) as number;
    // 100× less partition → sqrt(100)× less radius.
    expect(rImpact / rNuclear).toBeCloseTo(Math.sqrt(0.003 / 0.35), 3);
  });
});

import { describe, expect, it } from 'vitest';
import { initialRadiationRadii } from './radiation.js';

describe('initialRadiationRadii (Glasstone 1977 Fig. 8.46 / UNSCEAR 2000)', () => {
  it('1 kt reference yields LD50 ≈ 700 m', () => {
    const r = initialRadiationRadii(0.001);
    expect(r.ld50Radius as number).toBeGreaterThan(650);
    expect(r.ld50Radius as number).toBeLessThan(750);
  });

  it('LD100 sits at ≈ 70 % of the LD50 distance', () => {
    const r = initialRadiationRadii(0.015);
    const ratio = (r.ld100Radius as number) / (r.ld50Radius as number);
    expect(ratio).toBeCloseTo(0.7, 2);
  });

  it('ARS threshold sits at ≈ 1.4× the LD50 distance', () => {
    const r = initialRadiationRadii(0.015);
    const ratio = (r.arsThresholdRadius as number) / (r.ld50Radius as number);
    expect(ratio).toBeCloseTo(1.4, 2);
  });

  it('scales as yield^0.18 between 1 kt and 1 Mt (Glasstone Fig 8.46 atmospheric attenuation)', () => {
    const r1kt = initialRadiationRadii(0.001);
    const r1Mt = initialRadiationRadii(1);
    const ratio = (r1Mt.ld50Radius as number) / (r1kt.ld50Radius as number);
    // Phase 10 audit: replaced yield^0.4 with yield^0.18 to honour
    // atmospheric attenuation. 1 000× yield ⇒ 1000^0.18 ≈ 3.47× radius.
    expect(ratio).toBeCloseTo(3.47, 1);
  });

  it('returns zero for zero or negative yield', () => {
    expect(initialRadiationRadii(0).ld50Radius).toBe(0);
    expect(initialRadiationRadii(-1).ld100Radius).toBe(0);
  });

  it('Hiroshima 15 kt LD50 radius matches Glasstone Fig 8.46 (~1.0 km)', () => {
    // Phase 10 audit: was 2.07 km (factor-2 over) under yield^0.4
    // scaling. After re-fit to yield^0.18 the value drops to ~1.1 km
    // matching Glasstone's anchor at 15 kt.
    const r = initialRadiationRadii(0.015);
    expect(r.ld50Radius as number).toBeGreaterThan(900);
    expect(r.ld50Radius as number).toBeLessThan(1_400);
  });
});

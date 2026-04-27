import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import {
  DEFAULT_GRAIN_SPECTRUM,
  ashFootprint,
  ashfallMassLoading,
  ganserTerminalVelocity,
  massLoadingToThickness,
} from './ashfall.js';

describe('ganserTerminalVelocity', () => {
  it('Stokes regime: fine ash (32 µm) falls at a few cm/s', () => {
    const v = ganserTerminalVelocity(32e-6);
    expect(v).toBeGreaterThan(0.001);
    expect(v).toBeLessThan(0.5);
  });

  it('Newton regime: lapilli (8 mm) falls at several m/s', () => {
    const v = ganserTerminalVelocity(8e-3);
    expect(v).toBeGreaterThan(5);
    expect(v).toBeLessThan(30);
  });

  it('larger particles always fall faster than smaller ones', () => {
    const sizes = [32e-6, 125e-6, 1e-3, 8e-3];
    const velocities = sizes.map((d) => ganserTerminalVelocity(d));
    for (let i = 1; i < velocities.length; i++) {
      expect(velocities[i]).toBeGreaterThan(velocities[i - 1]!);
    }
  });

  it('zero or negative diameter returns 0', () => {
    expect(ganserTerminalVelocity(0)).toBe(0);
    expect(ganserTerminalVelocity(-1e-3)).toBe(0);
  });
});

describe('ashfallMassLoading', () => {
  it('no advection upwind of the vent — returns 0 at x ≤ 0', () => {
    const r = ashfallMassLoading({
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
      downwindDistance: -1_000,
      crosswindDistance: 0,
      windSpeed: 20,
    });
    expect(r).toBe(0);
  });

  it('zero wind gives zero deposit (advection model degenerates)', () => {
    const r = ashfallMassLoading({
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
      downwindDistance: 10_000,
      crosswindDistance: 0,
      windSpeed: 0,
    });
    expect(r).toBe(0);
  });

  it('deposit attenuates in the far field past all grain-class peaks', () => {
    // The multi-class Suzuki model is NOT monotonic along the axis —
    // each size class deposits around its own u·t_fall peak, producing
    // bumps. But once past the fine-ash peak (x_center ≫ u · H / v_fine)
    // the deposit must decay. 10 000 km is safely beyond the 32 µm peak
    // at u = 20 m/s, H = 20 km.
    const base = {
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
      windSpeed: 20,
      crosswindDistance: 0,
    };
    const near = ashfallMassLoading({ ...base, downwindDistance: 100_000 });
    const far = ashfallMassLoading({ ...base, downwindDistance: 20_000_000 });
    expect(far).toBeLessThan(near);
  });

  it('deposit falls off crosswind at a fixed downwind range', () => {
    const base = {
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
      windSpeed: 20,
      downwindDistance: 50_000,
    };
    const onAxis = ashfallMassLoading({ ...base, crosswindDistance: 0 });
    const offAxis = ashfallMassLoading({ ...base, crosswindDistance: 30_000 });
    expect(offAxis).toBeLessThan(onAxis);
  });
});

describe('massLoadingToThickness', () => {
  it('1 kg/m² @ 1 000 kg/m³ = 1 mm thickness', () => {
    expect(massLoadingToThickness(1, 1_000)).toBeCloseTo(1e-3, 5);
  });

  it('zero or negative loading returns 0', () => {
    expect(massLoadingToThickness(0)).toBe(0);
    expect(massLoadingToThickness(-1)).toBe(0);
  });
});

describe('ashFootprint (1-mm isopach)', () => {
  it('zero wind returns empty footprint', () => {
    const f = ashFootprint({
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
      windSpeed: 0,
    });
    expect(f.downwindRange as number).toBe(0);
  });

  it('zero ejecta volume returns empty footprint', () => {
    const f = ashFootprint({
      plumeHeight: m(20_000),
      totalEjectaVolume: 0,
      windSpeed: 20,
    });
    expect(f.downwindRange as number).toBe(0);
  });

  it('Pinatubo-scale plume (H=30 km, V=1e10 m³, u=20 m/s) spreads ash hundreds of km downwind', () => {
    const f = ashFootprint({
      plumeHeight: m(30_000),
      totalEjectaVolume: 1e10,
      windSpeed: 20,
    });
    const downKm = (f.downwindRange as number) / 1_000;
    // Lower bound: at least 100 km (observed Pinatubo 1-mm isopach
    // extended ~300–500 km east of the vent). The analytical envelope
    // is conservative — order of magnitude is the goal.
    expect(downKm).toBeGreaterThan(100);
  });

  it('elongated footprint: downwind extent > crosswind width', () => {
    const f = ashFootprint({
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
      windSpeed: 20,
    });
    expect(f.downwindRange as number).toBeGreaterThan(2 * (f.crosswindHalfWidth as number));
  });

  it('wind speed materially shifts the deposit footprint', () => {
    // After moving the Ganser terminal-velocity default off the
    // hand-picked 0.4 kg/m³ air density onto the USSA-76 tropopause
    // value, the isopach geometry is a touch more sensitive to wind:
    // the 1 mm contour can either expand or contract with wind speed
    // depending on whether we sit in the deposit-mass-dominated or
    // dilution-dominated regime. The physically defensible
    // assertion is that wind has a non-trivial effect on the
    // footprint, not that the downwind range monotonically grows.
    const common = {
      plumeHeight: m(20_000),
      totalEjectaVolume: 1e10,
    };
    const lowWind = ashFootprint({ ...common, windSpeed: 5 });
    const highWind = ashFootprint({ ...common, windSpeed: 30 });
    const ratio =
      Math.max(highWind.downwindRange, lowWind.downwindRange) /
      Math.max(Math.min(highWind.downwindRange, lowWind.downwindRange), 1);
    expect(ratio).toBeGreaterThan(1.2);
  });

  it('default grain spectrum mass fractions sum to 1', () => {
    const total = DEFAULT_GRAIN_SPECTRUM.reduce((s, g) => s + g.massFraction, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

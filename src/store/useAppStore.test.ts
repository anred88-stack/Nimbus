import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EARTHQUAKE_PRESETS } from '../physics/events/earthquake/index.js';
import { VOLCANO_PRESETS } from '../physics/events/volcano/index.js';
import { IMPACT_PRESETS } from '../physics/simulate.js';
import { TRANSITION_HALF_MS, resetAppStore, useAppStore } from './useAppStore.js';

beforeEach(() => {
  resetAppStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppStore — initial state', () => {
  it('starts on the impact event with a Chicxulub preset loaded', () => {
    const s = useAppStore.getState();
    expect(s.eventType).toBe('impact');
    expect(s.impact.preset).toBe('CHICXULUB');
    expect(s.impact.input).toBe(IMPACT_PRESETS.CHICXULUB.input);
    expect(s.result).toBeNull();
    expect(s.status).toBe('idle');
    expect(s.mode).toBe('landing');
  });

  it('pre-loads a Tōhoku earthquake preset and Krakatau volcano preset', () => {
    const s = useAppStore.getState();
    expect(s.earthquake.preset).toBe('TOHOKU_2011');
    expect(s.earthquake.input).toBe(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
    expect(s.volcano.preset).toBe('KRAKATAU_1883');
    expect(s.volcano.input).toBe(VOLCANO_PRESETS.KRAKATAU_1883.input);
  });
});

describe('useAppStore — selectEventType', () => {
  it('flips the active category and clears any stale result', async () => {
    await useAppStore.getState().evaluate();
    expect(useAppStore.getState().result).not.toBeNull();

    useAppStore.getState().selectEventType('earthquake');
    const s = useAppStore.getState();
    expect(s.eventType).toBe('earthquake');
    expect(s.result).toBeNull();
    expect(s.status).toBe('idle');
  });
});

describe('useAppStore — selectPreset', () => {
  it('switches to impact mode and loads an impact preset', () => {
    useAppStore.getState().selectPreset('TUNGUSKA');
    const s = useAppStore.getState();
    expect(s.eventType).toBe('impact');
    expect(s.impact.preset).toBe('TUNGUSKA');
    expect(s.impact.input).toBe(IMPACT_PRESETS.TUNGUSKA.input);
  });

  it('switches to earthquake mode when given an earthquake preset', () => {
    useAppStore.getState().selectPreset('NORTHRIDGE_1994');
    const s = useAppStore.getState();
    expect(s.eventType).toBe('earthquake');
    expect(s.earthquake.preset).toBe('NORTHRIDGE_1994');
    expect(s.earthquake.input).toBe(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
  });

  it('switches to volcano mode when given a volcano preset', () => {
    useAppStore.getState().selectPreset('TAMBORA_1815');
    const s = useAppStore.getState();
    expect(s.eventType).toBe('volcano');
    expect(s.volcano.preset).toBe('TAMBORA_1815');
    expect(s.volcano.input).toBe(VOLCANO_PRESETS.TAMBORA_1815.input);
  });

  it('drops the stale result after a preset switch', async () => {
    await useAppStore.getState().evaluate();
    expect(useAppStore.getState().result).not.toBeNull();
    useAppStore.getState().selectPreset('KRAKATAU_1883');
    expect(useAppStore.getState().result).toBeNull();
  });
});

describe('useAppStore — setImpactInput', () => {
  it('marks the impact preset as CUSTOM and preserves unchanged fields', () => {
    useAppStore.getState().setImpactInput({ impactorDiameter: 5_000 });
    const s = useAppStore.getState();
    expect(s.eventType).toBe('impact');
    expect(s.impact.preset).toBe('CUSTOM');
    expect(s.impact.input.impactorDiameter as number).toBe(5_000);
    expect(s.impact.input.impactVelocity as number).toBe(20_000);
  });

  it('converts impact angle from degrees to radians', () => {
    useAppStore.getState().setImpactInput({ impactAngle: 90 });
    expect(useAppStore.getState().impact.input.impactAngle as number).toBeCloseTo(Math.PI / 2, 12);
  });

  it('invalidates the current result and switches back to impact mode', async () => {
    useAppStore.getState().selectEventType('volcano');
    await useAppStore.getState().evaluate();
    expect(useAppStore.getState().result).not.toBeNull();
    useAppStore.getState().setImpactInput({ impactorDiameter: 1_000 });
    const s = useAppStore.getState();
    expect(s.eventType).toBe('impact');
    expect(s.result).toBeNull();
  });

  it('normalises impactAzimuthDeg into [0, 360) and persists it', () => {
    useAppStore.getState().setImpactInput({ impactAzimuthDeg: 405 });
    expect(useAppStore.getState().impact.input.impactAzimuthDeg).toBe(45);
    useAppStore.getState().setImpactInput({ impactAzimuthDeg: -90 });
    expect(useAppStore.getState().impact.input.impactAzimuthDeg).toBe(270);
  });
});

describe('useAppStore — evaluate', () => {
  it('runs simulateImpact on the current impact input and tags the result', async () => {
    await useAppStore.getState().evaluate();
    const s = useAppStore.getState();
    expect(s.result).not.toBeNull();
    expect(s.result?.type).toBe('impact');
    if (s.result?.type === 'impact') {
      expect(s.result.data.crater.morphology).toBe('complex');
    }
  });

  it('runs simulateEarthquake when eventType is earthquake', async () => {
    useAppStore.getState().selectPreset('NORTHRIDGE_1994');
    await useAppStore.getState().evaluate();
    const s = useAppStore.getState();
    expect(s.result?.type).toBe('earthquake');
    if (s.result?.type === 'earthquake') {
      expect(s.result.data.shaking.mmiAtEpicenter).toBeGreaterThan(5);
    }
  });

  it('runs simulateVolcano when eventType is volcano', async () => {
    useAppStore.getState().selectPreset('KRAKATAU_1883');
    await useAppStore.getState().evaluate();
    const s = useAppStore.getState();
    expect(s.result?.type).toBe('volcano');
    if (s.result?.type === 'volcano') {
      expect(s.result.data.vei).toBe(6);
    }
  });
});

describe('useAppStore — location', () => {
  it('setLocation stores valid WGS84 coordinates and clearLocation resets', () => {
    useAppStore.getState().setLocation({ latitude: 21.3, longitude: -89.5 });
    expect(useAppStore.getState().location).toEqual({ latitude: 21.3, longitude: -89.5 });
    useAppStore.getState().clearLocation();
    expect(useAppStore.getState().location).toBeNull();
  });

  it('setLocation rejects out-of-range coordinates', () => {
    expect(() => {
      useAppStore.getState().setLocation({ latitude: 200, longitude: 0 });
    }).toThrow(/Invalid/);
  });
});

describe('useAppStore — view mode + transitionTo', () => {
  it('setMode updates the view instantly', () => {
    useAppStore.getState().setMode('globe');
    expect(useAppStore.getState().mode).toBe('globe');
  });

  it('transitionTo animates through fading-out → swap → fading-in → idle', () => {
    vi.useFakeTimers();
    useAppStore.getState().setMode('landing');
    useAppStore.getState().transitionTo('globe');

    expect(useAppStore.getState().transitionPhase).toBe('fading-out');
    expect(useAppStore.getState().mode).toBe('landing');

    vi.advanceTimersByTime(TRANSITION_HALF_MS);
    expect(useAppStore.getState().mode).toBe('globe');
    expect(useAppStore.getState().transitionPhase).toBe('fading-in');

    vi.advanceTimersByTime(TRANSITION_HALF_MS);
    expect(useAppStore.getState().transitionPhase).toBe('idle');
  });

  it('transitionTo { instant: true } skips the animation', () => {
    useAppStore.getState().setMode('landing');
    useAppStore.getState().transitionTo('globe', { instant: true });
    expect(useAppStore.getState().mode).toBe('globe');
    expect(useAppStore.getState().transitionPhase).toBe('idle');
  });
});

describe('useAppStore — reset', () => {
  it('restores every slice to its initial value', async () => {
    useAppStore.getState().selectPreset('TAMBORA_1815');
    useAppStore.getState().setLocation({ latitude: 21.3, longitude: -89.5 });
    await useAppStore.getState().evaluate();
    useAppStore.getState().setMode('globe');

    useAppStore.getState().reset();

    const s = useAppStore.getState();
    expect(s.eventType).toBe('impact');
    expect(s.impact.preset).toBe('CHICXULUB');
    expect(s.location).toBeNull();
    expect(s.result).toBeNull();
    expect(s.mode).toBe('landing');
  });
});

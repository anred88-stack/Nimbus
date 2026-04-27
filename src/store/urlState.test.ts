import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyIntentToStore,
  decodeSearchParamsToIntent,
  decodeUrl,
  encodeStateToSearchParams,
  knownUrlKeys,
  projectSyncableState,
  URL_KEYS,
  URL_STATE_VERSION,
} from './urlState.js';
import { resetAppStore, useAppStore } from './useAppStore.js';

beforeEach(() => {
  resetAppStore();
});

describe('encodeStateToSearchParams', () => {
  it('emits the baseline Chicxulub impact URL', () => {
    const params = encodeStateToSearchParams(projectSyncableState(useAppStore.getState()));
    expect(params.get(URL_KEYS.version)).toBe(URL_STATE_VERSION.toString());
    expect(params.get(URL_KEYS.eventType)).toBe('impact');
    expect(params.get(URL_KEYS.preset)).toBe('CHICXULUB');
    // Landing mode is the default — don't put it in the URL.
    expect(params.get(URL_KEYS.mode)).toBeNull();
    // No location picked yet.
    expect(params.get(URL_KEYS.latitude)).toBeNull();
  });

  it('includes location and non-landing mode when set', () => {
    useAppStore.getState().setLocation({ latitude: 21.3, longitude: -89.5 });
    useAppStore.getState().setMode('globe');
    const params = encodeStateToSearchParams(projectSyncableState(useAppStore.getState()));
    expect(params.get(URL_KEYS.latitude)).toBe('21.3');
    expect(params.get(URL_KEYS.longitude)).toBe('-89.5');
    expect(params.get(URL_KEYS.mode)).toBe('globe');
  });

  it('encodes an earthquake preset', () => {
    useAppStore.getState().selectPreset('TOHOKU_2011');
    const params = encodeStateToSearchParams(projectSyncableState(useAppStore.getState()));
    expect(params.get(URL_KEYS.eventType)).toBe('earthquake');
    expect(params.get(URL_KEYS.preset)).toBe('TOHOKU_2011');
  });

  it('encodes a volcano preset', () => {
    useAppStore.getState().selectPreset('KRAKATAU_1883');
    const params = encodeStateToSearchParams(projectSyncableState(useAppStore.getState()));
    expect(params.get(URL_KEYS.eventType)).toBe('volcano');
    expect(params.get(URL_KEYS.preset)).toBe('KRAKATAU_1883');
  });

  it('serialises CUSTOM impact overrides in short keys', () => {
    useAppStore.getState().setImpactInput({ impactorDiameter: 1_200, impactAngle: 30 });
    const params = encodeStateToSearchParams(projectSyncableState(useAppStore.getState()));
    expect(params.get(URL_KEYS.preset)).toBe('CUSTOM');
    expect(params.get(URL_KEYS.diameter)).toBe('1200');
    // impactAngle round-trips via degrees → radians → degrees within trim precision.
    expect(Number(params.get(URL_KEYS.angleDeg))).toBeCloseTo(30, 2);
  });
});

describe('decodeSearchParamsToIntent', () => {
  it('parses a standard impact URL', () => {
    const params = new URLSearchParams(
      `?${URL_KEYS.version}=1&${URL_KEYS.eventType}=impact&${URL_KEYS.preset}=TUNGUSKA&${URL_KEYS.latitude}=45.9&${URL_KEYS.longitude}=7.9&${URL_KEYS.mode}=globe`
    );
    const intent = decodeSearchParamsToIntent(params);
    expect(intent.eventType).toBe('impact');
    expect(intent.preset).toBe('TUNGUSKA');
    expect(intent.location).toEqual({ latitude: 45.9, longitude: 7.9 });
    expect(intent.mode).toBe('globe');
  });

  it('drops invalid preset ids silently', () => {
    const params = new URLSearchParams(
      `?${URL_KEYS.eventType}=impact&${URL_KEYS.preset}=MADE_UP_PRESET`
    );
    expect(decodeSearchParamsToIntent(params).preset).toBeNull();
  });

  it('rejects out-of-range lat/lon', () => {
    const params = new URLSearchParams(`?${URL_KEYS.latitude}=200&${URL_KEYS.longitude}=0`);
    expect(decodeSearchParamsToIntent(params).location).toBeNull();
  });

  it('ignores unknown event types', () => {
    const params = new URLSearchParams(`?${URL_KEYS.eventType}=supernova`);
    expect(decodeSearchParamsToIntent(params).eventType).toBeNull();
  });

  it('parses CUSTOM impact overrides when preset=CUSTOM', () => {
    const params = new URLSearchParams(
      `?${URL_KEYS.eventType}=impact&${URL_KEYS.preset}=CUSTOM&${URL_KEYS.diameter}=500&${URL_KEYS.velocity}=18000&${URL_KEYS.angleDeg}=60`
    );
    const intent = decodeSearchParamsToIntent(params);
    expect(intent.preset).toBe('CUSTOM');
    expect(intent.impactCustomInput).toEqual({
      impactorDiameter: 500,
      impactVelocity: 18_000,
      impactAngle: 60,
    });
  });

  it('drops CUSTOM overrides when preset is a named one', () => {
    const params = new URLSearchParams(
      `?${URL_KEYS.eventType}=impact&${URL_KEYS.preset}=CHICXULUB&${URL_KEYS.diameter}=500`
    );
    expect(decodeSearchParamsToIntent(params).impactCustomInput).toBeNull();
  });
});

describe('decodeUrl', () => {
  it('parses a full URL string', () => {
    const intent = decodeUrl('https://example.com/?t=impact&p=TUNGUSKA&m=globe');
    expect(intent.eventType).toBe('impact');
    expect(intent.preset).toBe('TUNGUSKA');
    expect(intent.mode).toBe('globe');
  });

  it('returns a null-filled intent on malformed URLs', () => {
    const intent = decodeUrl('not a url');
    expect(intent.eventType).toBeNull();
    expect(intent.preset).toBeNull();
  });
});

describe('applyIntentToStore', () => {
  it('applies each field via the typed store actions', () => {
    applyIntentToStore(
      {
        eventType: 'earthquake',
        preset: 'NORTHRIDGE_1994',
        location: { latitude: 34.2, longitude: -118.5 },
        mode: 'globe',
        impactCustomInput: null,
      },
      useAppStore.getState()
    );
    const s = useAppStore.getState();
    expect(s.eventType).toBe('earthquake');
    expect(s.earthquake.preset).toBe('NORTHRIDGE_1994');
    expect(s.location).toEqual({ latitude: 34.2, longitude: -118.5 });
    expect(s.mode).toBe('globe');
  });

  it('applies CUSTOM impact input via setImpactInput', () => {
    applyIntentToStore(
      {
        eventType: 'impact',
        preset: 'CUSTOM',
        location: null,
        mode: null,
        impactCustomInput: { impactorDiameter: 250 },
      },
      useAppStore.getState()
    );
    const s = useAppStore.getState();
    expect(s.impact.preset).toBe('CUSTOM');
    expect(s.impact.input.impactorDiameter as number).toBe(250);
  });
});

describe('round trip: store → encode → decode → apply', () => {
  it('restores the exact same preset-level state', () => {
    useAppStore.getState().selectPreset('TAMBORA_1815');
    useAppStore.getState().setLocation({ latitude: -8.25, longitude: 118 });
    useAppStore.getState().setMode('globe');

    const urlParams = encodeStateToSearchParams(projectSyncableState(useAppStore.getState()));
    resetAppStore();
    applyIntentToStore(decodeSearchParamsToIntent(urlParams), useAppStore.getState());

    const s = useAppStore.getState();
    expect(s.eventType).toBe('volcano');
    expect(s.volcano.preset).toBe('TAMBORA_1815');
    expect(s.location).toEqual({ latitude: -8.25, longitude: 118 });
    expect(s.mode).toBe('globe');
  });
});

describe('knownUrlKeys', () => {
  it('lists every key currently supported by the schema', () => {
    expect(knownUrlKeys()).toEqual(Object.values(URL_KEYS));
  });
});

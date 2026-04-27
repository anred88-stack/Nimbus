import { beforeEach, describe, expect, it } from 'vitest';
import { resetAppStore, useAppStore } from './useAppStore.js';
import { hydrateStoreFromUrl, maybeAutoEvaluate, writeStoreToHistory } from './urlSync.js';

/** Minimal window-like stub that satisfies writeStoreToHistory — the
 *  function only uses `location.{pathname,search,hash,href}` and
 *  `history.replaceState`. */
function createFakeWindow(initialUrl: string): {
  win: Window;
  pushed: string[];
} {
  const url = new URL(initialUrl);
  const pushed: string[] = [];
  const history = {
    replaceState: (_state: unknown, _title: string, next: string): void => {
      pushed.push(next);
      const resolved = new URL(next, url.origin);
      url.pathname = resolved.pathname;
      url.search = resolved.search;
      url.hash = resolved.hash;
    },
  };
  const location = {
    get href(): string {
      return url.toString();
    },
    get pathname(): string {
      return url.pathname;
    },
    get search(): string {
      return url.search;
    },
    get hash(): string {
      return url.hash;
    },
  };
  const win = { location, history } as unknown as Window;
  return { win, pushed };
}

beforeEach(() => {
  resetAppStore();
});

describe('hydrateStoreFromUrl', () => {
  it('applies an earthquake preset from the search fragment', () => {
    hydrateStoreFromUrl(
      'http://localhost/?t=earthquake&p=TOHOKU_2011&lat=38.1&lon=142.4&m=globe',
      useAppStore.getState()
    );
    const s = useAppStore.getState();
    expect(s.eventType).toBe('earthquake');
    expect(s.earthquake.preset).toBe('TOHOKU_2011');
    expect(s.location).toEqual({ latitude: 38.1, longitude: 142.4 });
    expect(s.mode).toBe('globe');
  });

  it('is a no-op for a URL without recognised keys', () => {
    const before = useAppStore.getState();
    hydrateStoreFromUrl('http://localhost/?unrelated=1', useAppStore.getState());
    const after = useAppStore.getState();
    expect(after.eventType).toBe(before.eventType);
    expect(after.impact.preset).toBe(before.impact.preset);
  });
});

describe('maybeAutoEvaluate', () => {
  it('runs evaluate when location and non-landing mode are set', async () => {
    useAppStore.getState().setLocation({ latitude: 38.1, longitude: 142.4 });
    useAppStore.getState().setMode('globe');
    await maybeAutoEvaluate(useAppStore.getState());
    expect(useAppStore.getState().result).not.toBeNull();
  });

  it('is a no-op when location is missing', async () => {
    useAppStore.getState().setMode('globe');
    await maybeAutoEvaluate(useAppStore.getState());
    expect(useAppStore.getState().result).toBeNull();
  });

  it('is a no-op in landing mode even with a location', async () => {
    useAppStore.getState().setLocation({ latitude: 0, longitude: 0 });
    await maybeAutoEvaluate(useAppStore.getState());
    expect(useAppStore.getState().result).toBeNull();
  });
});

describe('writeStoreToHistory', () => {
  it('writes the schema keys and preserves unrelated query params', () => {
    const { win, pushed } = createFakeWindow('http://app.test/?lng=en&debug=1');
    useAppStore.getState().selectPreset('TUNGUSKA');
    useAppStore.getState().setLocation({ latitude: 60.9, longitude: 101.9 });
    useAppStore.getState().setMode('globe');

    writeStoreToHistory(useAppStore.getState(), win);

    expect(pushed).toHaveLength(1);
    const writtenUrl = new URL(pushed[0]!, 'http://app.test/');
    expect(writtenUrl.searchParams.get('t')).toBe('impact');
    expect(writtenUrl.searchParams.get('p')).toBe('TUNGUSKA');
    expect(writtenUrl.searchParams.get('m')).toBe('globe');
    // Preserved params from the initial URL.
    expect(writtenUrl.searchParams.get('lng')).toBe('en');
    expect(writtenUrl.searchParams.get('debug')).toBe('1');
  });

  it('is a no-op when the resulting URL is byte-identical', () => {
    const { win, pushed } = createFakeWindow('http://app.test/?v=1&t=impact&p=CHICXULUB');
    // Store already defaults to impact + CHICXULUB, landing mode.
    // Writing should produce the same URL → no history entry.
    writeStoreToHistory(useAppStore.getState(), win);
    expect(pushed).toHaveLength(0);
  });

  it('round-trips through a shared-link flow', async () => {
    // 1. User A builds a scenario and publishes the URL.
    useAppStore.getState().selectPreset('KRAKATAU_1883');
    useAppStore.getState().setLocation({ latitude: -6.1, longitude: 105.4 });
    useAppStore.getState().setMode('globe');
    const { win, pushed } = createFakeWindow('http://app.test/');
    writeStoreToHistory(useAppStore.getState(), win);
    const sharedUrl = `http://app.test${pushed[0] ?? ''}`;

    // 2. User B lands on the URL in a fresh session.
    resetAppStore();
    hydrateStoreFromUrl(sharedUrl, useAppStore.getState());
    await maybeAutoEvaluate(useAppStore.getState());

    const s = useAppStore.getState();
    expect(s.eventType).toBe('volcano');
    expect(s.volcano.preset).toBe('KRAKATAU_1883');
    expect(s.location).toEqual({ latitude: -6.1, longitude: 105.4 });
    expect(s.mode).toBe('globe');
    expect(s.result?.type).toBe('volcano');
  });
});

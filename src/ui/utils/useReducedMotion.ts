import { useEffect, useState } from 'react';

const MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Subscribes to the `prefers-reduced-motion: reduce` media query. The
 * returned boolean stays in sync if the OS-level setting changes while
 * the app is running.
 *
 * Default on SSR and when `matchMedia` is unavailable: `false` — we
 * render the normal motion experience and only downgrade when the OS
 * explicitly opts out. This matches the project art direction rule in
 * docs/ART_DIRECTION.md §Motion.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(MEDIA_QUERY);
    const listener = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    mql.addEventListener('change', listener);
    return () => {
      mql.removeEventListener('change', listener);
    };
  }, []);

  return reduced;
}

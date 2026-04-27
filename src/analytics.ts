/**
 * Opt-in Plausible analytics loader. No cookies, no PII, no
 * fingerprinting — Plausible's default script is GDPR-compliant out
 * of the box. We only inject it when a deploy-time environment
 * variable provides the tracked domain, so local dev, preview builds,
 * and forks don't ping production analytics.
 *
 * Set `VITE_PLAUSIBLE_DOMAIN` in the deploy environment (e.g.
 * Cloudflare Pages) to activate the tracker. `VITE_PLAUSIBLE_API_HOST`
 * is optional; defaults to the public plausible.io script CDN.
 */
export function initAnalytics(): void {
  if (typeof document === 'undefined') return;

  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
  if (!domain || typeof domain !== 'string' || domain.length === 0) return;

  // Respect the global Do-Not-Track signal even before Plausible runs;
  // the script itself honours DNT too, but short-circuiting here keeps
  // the request out of the network tab entirely.
  if (navigator.doNotTrack === '1') return;

  const apiHost = import.meta.env.VITE_PLAUSIBLE_API_HOST ?? 'https://plausible.io';

  const script = document.createElement('script');
  script.defer = true;
  script.dataset.domain = domain;
  script.src = `${apiHost}/js/script.js`;
  document.head.appendChild(script);
}

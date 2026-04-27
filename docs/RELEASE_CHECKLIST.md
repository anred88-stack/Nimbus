# Release checklist — v1.0.0

Pre-flight for cutting a public release. Every item must be checked
or have a written reason in the release PR before pushing the
`v1.0.0` tag.

## 1. Identity

- [x] Project name resolved — **Nimbus** (display) / **Nuclear & Impact Modeling & Blast Understanding System**
      (long form) / **nimbus** (technical).
- [x] All `PROJECT_NAME` / `Project Name` / `project-name` placeholders
      substituted.
- [x] All `GITHUB_USERNAME` placeholders substituted (repo:
      `anred88-stack/Nimbus`).
- [ ] `TBD` in `LICENSE`, `NOTICE`, `CODEOWNERS` replaced with the
      real copyright holder.
- [ ] `conduct@example.com` and `security@example.com` replaced with
      real addresses in `CODE_OF_CONDUCT.md` and `SECURITY.md`.
- [ ] `PROJECT_TAGLINE` in `CLAUDE.md` updated to the final wording.

## 2. CI / deploy

- [ ] `.github/workflows/ci.yml` green on `main`.
- [ ] `.github/workflows/e2e.yml` matrix (chromium / firefox / webkit /
      mobile-chrome / mobile-safari) green on `main`.
- [ ] `.github/workflows/lighthouse.yml` reports accessibility = 1.0
      and current LCP / TBT / CLS on `main`.
- [ ] Cloudflare Pages production deploy serves the latest `main`;
      preview links open from every PR.

      The deploy job is gated on `ENABLE_CF_DEPLOY=true`. Before
      flipping it:

      1. Create a Pages project called `nimbus`.
      2. Add repo secrets `CLOUDFLARE_API_TOKEN` (Pages → Edit) and
         `CLOUDFLARE_ACCOUNT_ID`.
      3. Set `ENABLE_CF_DEPLOY=true` (Settings → Variables).
      4. Re-run the latest deploy workflow.

## 3. Analytics & privacy

- [ ] `VITE_PLAUSIBLE_DOMAIN` set in the Pages production environment
      (not preview, not dev).
- [ ] `VITE_STADIA_API_KEY` set in the Pages production environment.
      Register a free domain-restricted key on stadiamaps.com and
      thread it through the basemap URL (currently keyless dev path
      in `Globe.tsx`).
- [ ] Plausible dashboard receives pageviews within 10 minutes of a
      deploy.
- [ ] Privacy / analytics note in the footer or About dialog.
- [ ] `SECURITY.md` lists a real disclosure channel.

## 4. Content

- [ ] Every preset renders with no TODO strings or placeholder
      captions, in IT and EN.
- [ ] `docs/ASSETS.md` matches `public/`. Every CC-BY asset has an
      in-app attribution line.
- [ ] `README.md` screenshots updated to the final branding.
- [ ] `docs/ART_DIRECTION.md` palette tokens match the production
      CSS custom properties.

## 5. Scientific review

- [ ] A scientifically-literate reviewer has signed off on the
      physics modules in the last 30 days. Earth scientist for the
      M3 modules, physicist or engineer for impact / explosion.
- [ ] Every citation in `docs/SCIENCE.md`, the citation tooltips,
      and the glossary points at a real paper or textbook chapter.

## 6. Release mechanics

- [ ] Promote `[Unreleased]` in `CHANGELOG.md` to a dated `[1.0.0]`
      heading.
- [ ] Tag: `git tag -s v1.0.0 -m "Release v1.0.0"` then
      `git push origin v1.0.0`. Signed only.
- [ ] Create a GitHub release from the tag with the `[1.0.0]`
      changelog section as the body.
- [ ] Publish the announcement post on whichever channels you own.
- [ ] Pin the `v1.0.0` release on the repo homepage.

## 7. First 24 h

- [ ] Watch the Plausible dashboard (404s on `/cesium/*` are the
      most common regression).
- [ ] Watch the issues queue.
- [ ] Have a `v1.0.1` branch ready for hot-fixes.

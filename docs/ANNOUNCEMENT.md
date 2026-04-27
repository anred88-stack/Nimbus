# Announcement draft — v1.0.0

A working draft. Polish on the way out the door.

Placeholders:

- `PROJECT_URL` — the production Cloudflare Pages URL.
- `PROJECT_TAGLINE` — the one-sentence pitch.

---

## Short post (≤ 280 chars)

> Nimbus just hit v1.0: an open-source scientific simulator for cosmic
> impacts, nuclear blasts, earthquakes, volcanoes and tsunamis,
> rendered at true scale on a 3D Earth. Peer-reviewed formulas,
> shareable URLs.
> ➜ PROJECT_URL

## Medium post (Mastodon / LinkedIn / HN)

> **Nimbus** v1.0 is out — an open-source simulator of catastrophic
> events on an interactive 3D globe.
>
> Pick an event (asteroid impact, nuclear detonation, earthquake,
> volcanic eruption, submarine landslide), drop a pin on the planet,
> and watch the cascade play out at true scale: crater, blast,
> thermal pulse, felt-intensity contours, pyroclastic reach,
> bathymetric tsunami isochrones.
>
> Every number traces back to a published paper — Collins/Melosh/
> Marcus 2005 for crater scaling, Glasstone & Dolan 1977 for nuclear
> blast, Ward & Asphaug 2000 for impact tsunamis, Mastin 2009 for
> plume heights, Joyner & Boore 1981 + Worden 2012 for seismic
> shaking. Tooltips cite the source; a glossary defines the terms;
> the whole scenario serialises to a URL.
>
> Stack: React 19, TypeScript strict, Cesium, Comlink-wrapped
> physics worker. WCAG 2.1 AA. Cross-browser on Chromium / Firefox /
> WebKit and mobile viewports.
>
> Try it: PROJECT_URL
> Source: https://github.com/anred88-stack/Nimbus

## Long-form post

### Why another disaster simulator

Most impact and blast simulators fall into two buckets: engineering
tools that ask for a dozen inputs before they show a number, and
entertainment apps that pick numbers for drama instead of science.
Neither builds intuition for what a megaton actually looks like next
to a kiloton, or why the Chicxulub impactor's tsunami matters more
than the crater it left behind.

Nimbus is the third option: rigorous numbers rendered legibly. Every
visible quantity links to the paper that produced it. Every preset is
a real historical event, dated and referenced. The whole thing runs
in the browser. No install, no login, no ads.

### What you can do with it

- Pick from 20 historical scenarios across five event types: cosmic
  impacts (Chicxulub, Tunguska, Chelyabinsk, Meteor Crater),
  explosions (Hiroshima, Nagasaki, Castle Bravo, Tsar Bomba, Beirut
  2020, Halifax 1917), earthquakes (Tōhoku, Sumatra–Andaman, Lisbon
  1755, Northridge, L'Aquila, Amatrice), volcanoes (Krakatau, Mt St
  Helens, Tambora, Pinatubo, Eyjafjallajökull, Hunga Tonga,
  Vesuvius 79 CE), submarine landslides (Storegga, Anak Krakatau,
  Lituya Bay, Vaiont). Plus custom inputs.
- Drop the pin anywhere on Earth. A Chicxulub-class asteroid landing
  off Newfoundland behaves qualitatively differently from one on the
  Yucatán shelf.
- See damage at true geographic scale on a Cesium globe (OSM
  imagery, no API key needed).
- Share the URL. Every scenario serialises to a compact query string
  that reproduces the exact simulation on any other device.

### Under the hood

- Layer 2 is a headless TypeScript physics engine with branded units
  (`Kilograms`, `Joules`, `MetersPerSecondSquared`, …) and an ESLint
  rule blocking React / Cesium / Three imports. It runs unchanged
  from the Node CLI: `pnpm simulate --event volcano --preset
KRAKATAU_1883` prints a JSON snapshot with 38 km plume, VEI 6,
  27 km pyroclastic reach.
- Layer 3 is the Cesium globe. Damage rings render as 2D ground
  primitives at true geographic radius, with a Fabric material that
  ramps alpha from centre to rim.
- Layer 4 is React with Radix dialogs (About, Glossary) and tooltips
  on every numeric readout.
- 595+ unit tests, 85 end-to-end tests across five browser/device
  profiles, automated Lighthouse and axe-core audits on every push.

### Credits

- OpenStreetMap contributors (ODbL 1.0) for the globe imagery.
- AWS Terrain Tiles (CC0) for bathymetry.
- WorldPop (Tatem 2017) for population exposure.
- Every cited paper in the tooltips and the glossary.
- Cloudflare Pages for the hosting.
- You, if you're about to open an issue with a correction.

### What's next

The v1.0 release is the foundation, not the destination. On the table:

- More event types (CME power-grid model, supervolcanic caldera
  collapse).
- OG-image generator so shared links preview with a globe thumbnail.
- Time-stepped playback ("show the blast wave at t = 3 s").
- Translations beyond IT + EN.

Pull requests, scientific corrections, and translations are welcome.
See [CONTRIBUTING.md](../CONTRIBUTING.md) for the DCO sign-off and
the scientific-review policy.

**Try it at PROJECT_URL.**

---

## OG image spec

- 1200 × 630, dark palette (`#0A0E16`).
- Foreground: a wide crater silhouette with a `--accent-hot`
  (`#D64A1F`) ring and a tiny landmark cluster on the rim.
- Headline: "Nimbus" in Inter 700 64 px.
- Tagline: PROJECT_TAGLINE in Inter 400 24 px below.
- Bottom right: the URL in JetBrains Mono 16 px (`--accent`).
- Generator worker deferred to post-v1.0.

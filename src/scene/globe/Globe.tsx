import {
  BoundingSphere,
  CallbackProperty,
  Cartesian3,
  Cartographic,
  Color,
  HeadingPitchRange,
  ImageMaterialProperty,
  Ion,
  JulianDate,
  Math as CesiumMath,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { EARTH_GREAT_CIRCLE_MAX, clampToGreatCircle } from '../../physics/earthScale.js';
import { ISOTROPIC_RING, type RingAsymmetry } from '../../physics/effects/asymmetry.js';
import { aftershockShakingFootprint } from '../../physics/events/earthquake/aftershocks.js';
import type { ImpactDamageRadii } from '../../physics/events/impact/damageRings.js';
import {
  useAppStore,
  type ActiveMonteCarlo,
  type ActiveResult,
  type Coordinates,
} from '../../store/index.js';
import type { WindAdvectedAshfall } from '../../physics/events/volcano/index.js';
import { renderScalarFieldHeatmap } from '../heatmap.js';
import {
  animateAftershocksImperatively,
  type AftershockAnimationSpec,
} from '../aftershockAnimation.js';
import {
  animateRingsImperatively,
  type RingAnimationSpec,
  type RingKind,
} from '../ringAnimation.js';
import { fetchTerrainGridForLocation } from '../terrainSampling.js';
import { AftershockDetailCard } from './AftershockDetailCard.js';
import { spawnExplosionVfxFromJoules } from './explosionVfx.js';
import { radialDamageMaterial } from './radialDamageMaterial.js';
import { RingTooltip, type HoverInfo, type RingTooltipKind } from './RingTooltip.js';
import styles from './Globe.module.css';

/**
 * We do not use Cesium.Ion-hosted assets (imagery, terrain) because the
 * project is open-source and we don't want to ship a bundled token or
 * force contributors to provision one. Clearing the default token also
 * silences the "Ion access token" warning at viewer startup.
 */
Ion.defaultAccessToken = '';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Ring palette — every hex is chosen for two constraints:
 *   1. **Within-event distinguishability**. The four impact rings (or
 *      four explosion rings) coexist on the same scene; they must be
 *      separable both by hue AND by luminance, so red-green colourblind
 *      viewers still read them as a four-step damage gradient.
 *   2. **Legibility on dark backgrounds**. Every swatch must have
 *      enough lightness to register on the legend's `#0C0E14`-ish glass
 *      panel — colours like `#5B1010` looked great on the OSM tile but
 *      vanished into the legend background.
 *
 * Cross-event hex collisions (e.g. mmi9 = same wine red as the impact
 * crater rim) are accepted: the two rings never appear on the same
 * scene, and the felt-intensity gradient deliberately mirrors the
 * "violent → severe → strong" cratering palette.
 */
const RING_COLORS: Record<keyof ImpactDamageRadii, Color> = {
  craterRim: Color.fromCssColorString('#B91C1C'),
  thirdDegreeBurn: Color.fromCssColorString('#F97316'),
  /** 2nd-degree burn (5 cal/cm² Glasstone Table 7.41) — sits between
   *  the strong-orange 3rd-degree contour and the gold overpressure
   *  rings. The amber tone reads as "less severe burn" without
   *  collapsing into either neighbouring contour. */
  secondDegreeBurn: Color.fromCssColorString('#FB923C'),
  overpressure5psi: Color.fromCssColorString('#FACC15'),
  overpressure1psi: Color.fromCssColorString('#FDE047'),
  /** Outermost overpressure ring (0.5 psi scattered window damage).
   *  Pale-cream so it sits OUTSIDE the gold 1 psi contour without
   *  fighting it for visual weight. */
  lightDamage: Color.fromCssColorString('#FEF3C7'),
};

/** Initial-radiation lethal-dose contour (Glasstone §8 — drawn only
 *  for nuclear scenarios, where the dose actually escapes the
 *  fireball envelope). Purple-violet keeps it separate from the
 *  thermal/blast warm gradient so users read it as a different
 *  hazard family, not "yet another orange ring". */
const RADIATION_LD50_COLOR = Color.fromCssColorString('#A855F7');

/** Electromagnetic-pulse footprint — the line at which a typical
 *  unhardened consumer electronic is at risk of damage from the E1
 *  spike. Deep teal so the EMP ring (often huge for HEMP shots)
 *  reads as cool / electronic vs the warm thermal/blast palette. */
const EMP_AFFECTED_COLOR = Color.fromCssColorString('#06B6D4');

/** Cool-blue palette for tsunami overlays — the only oceanic element
 *  on the globe, kept distinct from the warm damage rings. Brighter
 *  sky-cyan rather than the previous mid-blue so the cavity reads as
 *  "water moving fast", not "polite map symbol". */
const TSUNAMI_CAVITY_COLOR = Color.fromCssColorString('#38BDF8');

/**
 * Wave-front amplitude rings — three concentric circles centered on
 * the source at the ground ranges where the open-ocean wave amplitude
 * drops to 5 m / 1 m / 0.3 m. Painted as outline-only ellipses so the
 * eye reads them as propagating wave fronts, not as filled damage
 * zones. Colour ramp goes warm → cool with decreasing amplitude:
 *
 *   - 5 m  (deep destructive coastal wave) — magenta-rose, the
 *     equivalent of "Tōhoku-class damage" along the closest coast.
 *   - 1 m  (significant inundation, harbours flooded, small craft
 *     destroyed) — sky-cyan.
 *   - 0.3 m (notable but rarely fatal — basin-wide tide-gauge
 *     signature of a moderate event) — pale cyan.
 *
 * The thresholds match the IUGG / Tinti 2009 tsunami-intensity scale
 * tiers used in the runup-damage description (see SimulatorPanel),
 * so the ring on the globe and the damage-tier text in the panel
 * read as the same hazard story.
 */
const TSUNAMI_WAVE_FRONT_5M_COLOR = Color.fromCssColorString('#DB2777');
const TSUNAMI_WAVE_FRONT_1M_COLOR = Color.fromCssColorString('#22D3EE');
const TSUNAMI_WAVE_FRONT_03M_COLOR = Color.fromCssColorString('#A5F3FC');

/** Felt-intensity contour colours, ordered inside → outside. The
 *  ramp goes orange → red → wine so the eye reads VII–IX as an
 *  intensification rather than three flavours of the same red. */
const MMI_RING_COLORS = {
  mmi9: Color.fromCssColorString('#7F1D1D'),
  mmi8: Color.fromCssColorString('#DC2626'),
  mmi7: Color.fromCssColorString('#FB923C'),
} as const;

/** Pyroclastic-density-current reach. Rose-red rather than the
 *  previous orange-red so it reads as distinct from the magenta
 *  lateral-blast ring on the same scene. */
const PYROCLASTIC_RING_COLOR = Color.fromCssColorString('#E11D48');

/** Lateral-blast envelope (Mt St Helens-class flank decompression).
 *  Magenta-pink instead of the previous dark red — clearly different
 *  from the pyroclastic ring it shares the scene with, and the cooler
 *  hue suggests "directional pressure release" vs the thermal/runout
 *  warmth of the pyroclastic disc. */
const LATERAL_BLAST_COLOR = Color.fromCssColorString('#BE185D');

/** Wind-advected ashfall 1-mm isopach — pale grey, low-opacity fill. */
const ASHFALL_PLUME_COLOR = Color.fromCssColorString('#9CA3AF');

/** Ejecta-blanket footprint — chocolate brown rather than the previous
 *  mid-amber so it never visually merges with the gold 5 psi
 *  overpressure ring on the same impact scene. */
const EJECTA_BLANKET_COLOR = Color.fromCssColorString('#78350F');

const MARKER_ID = 'impact-marker';
const MARKER_HALO_ID = 'impact-marker-halo';
/** Marker tint — warm gold matching the existing accent token, with
 *  a soft white outline so the dot reads cleanly on both lit and
 *  shadowed terrain. */
const MARKER_COLOR = Color.fromCssColorString('#FCD34D');
const WAVEFRONT_INDICATOR_ID = 'cascade-wavefront-indicator';
const RING_ID_PREFIX = 'damage-ring-';
const TSUNAMI_CAVITY_ID = 'tsunami-cavity';
/** Entity ids for the three concentric wave-front rings painted at
 *  the source-amplitude → 5 m / 1 m / 0.3 m thresholds. Tracked as a
 *  tuple so the teardown sweep stays scoped. */
const TSUNAMI_WAVE_FRONT_IDS = [
  'tsunami-wavefront-5m',
  'tsunami-wavefront-1m',
  'tsunami-wavefront-03m',
] as const;
const MMI_RING_IDS = ['mmi-ring-7', 'mmi-ring-8', 'mmi-ring-9'] as const;
const PYROCLASTIC_RING_ID = 'pyroclastic-ring';
const ASHFALL_PLUME_ID = 'ashfall-plume';
const EJECTA_BLANKET_ID = 'ejecta-blanket';
const LATERAL_BLAST_ID = 'lateral-blast';
const AFTERSHOCK_ID_PREFIX = 'aftershock-';
/** Entity ids for the three "click-through" felt-intensity contours we
 *  paint around the aftershock the user has pinned. Kept as a tuple so
 *  the teardown / setup sweep stays tightly scoped. */
const AFTERSHOCK_DETAIL_IDS = [
  'aftershock-detail-mmi5',
  'aftershock-detail-mmi6',
  'aftershock-detail-mmi7',
] as const;
/** Aftershock points are colour-graded by magnitude — pale-orange for
 *  Mc-class events, deep-red for Båth-ceiling-class. */
const AFTERSHOCK_COLOR_LOW = Color.fromCssColorString('#fbbf24');
const AFTERSHOCK_COLOR_HIGH = Color.fromCssColorString('#b91c1c');
const ISOCHRONE_ID_PREFIX = 'tsunami-isochrone-';
const FMM_HEATMAP_ID = 'tsunami-fmm-heatmap';
const FMM_AMPLITUDE_HEATMAP_ID = 'tsunami-fmm-amplitude';
/** Colour ramp for the default 1/2/4/8 h isochrone set — cool to warm. */
const ISOCHRONE_COLORS: readonly Color[] = [
  Color.fromCssColorString('#38bdf8'), // 1 h — sky
  Color.fromCssColorString('#60a5fa'), // 2 h — blue
  Color.fromCssColorString('#c084fc'), // 4 h — violet
  Color.fromCssColorString('#f472b6'), // 8 h — pink
];
const EXPLOSION_RING_IDS = [
  'explosion-crater',
  'explosion-thermal',
  'explosion-thermal-2nd',
  'explosion-5psi',
  'explosion-1psi',
  'explosion-light-damage',
  'explosion-radiation-ld50',
  'explosion-emp',
] as const;
const FUZZY_RING_ID_PREFIX = 'fuzzy-mc-';

/**
 * Compute the {@link JulianDate} at which the sun reaches its highest
 * elevation over the supplied longitude on today's UTC date.
 *
 * Earth rotates at 15°/hour, so local solar noon at longitude L°
 * occurs at UTC 12:00 − L/15 hours. Anchoring `viewer.clock` to that
 * instant guarantees the picked point is always lit without sacrificing
 * the URL-shareability contract (every visitor opening the same link
 * sees the same lighting state, since the offset depends only on the
 * picked longitude, not on the visitor's wall clock).
 *
 * The today's-UTC-date floor keeps the seasonal sun declination — and
 * hence the realistic illumination angle on Earth's axial tilt — close
 * to "what the planet looks like right now from space," instead of
 * freezing to an arbitrary epoch.
 */
function localSolarNoonForLongitude(longitudeDeg: number): JulianDate {
  const now = new Date();
  const noonUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    12,
    0,
    0,
    0
  );
  const offsetMs = (longitudeDeg / 15) * 3_600_000;
  return JulianDate.fromDate(new Date(noonUtcMs - offsetMs));
}

export function Globe(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  // --- Hover-tooltip plumbing ----------------------------------------
  // Metadata for every "tooltip-aware" entity, keyed by entity id.
  // Populated when rings/aftershocks are added to the scene; cleared
  // when they're torn down. The mousemove handler reads this map to
  // map a picked entity back to its plain-language description.
  const tooltipMetaRef = useRef<Map<string, HoverInfo>>(new Map());
  // DOM ref used to mutate the tooltip's style.left/top imperatively
  // on every mousemove — avoids re-rendering React 60 times a second
  // just to track the cursor.
  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  // The *content* of the tooltip — only changes when the cursor enters
  // or leaves a tooltip-aware entity, so React re-renders are sparse.
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  // True while a Terrarium tile fetch is in-flight for the current
  // pick. Read by the marker halo's CallbackProperty to drive the
  // breathing pulse — gives the user a visible signal that the
  // bathymetry / Vs30 data is on its way without occupying screen
  // real-estate with a separate spinner.
  const terrainPulsingRef = useRef(false);

  const setLocation = useAppStore((s) => s.setLocation);
  const selectAftershock = useAppStore((s) => s.selectAftershock);
  const selectedAftershockIndex = useAppStore((s) => s.selectedAftershockIndex);
  const location = useAppStore((s) => s.location);
  const result = useAppStore((s) => s.result);
  const bathymetricTsunami = useAppStore((s) => s.bathymetricTsunami);
  const monteCarlo = useAppStore((s) => s.monteCarlo);
  const setElevationGrid = useAppStore((s) => s.setElevationGrid);
  const hiddenRingKeys = useAppStore((s) => s.hiddenRingKeys);

  // The entity-rebuild useEffect below depends on `result` and friends,
  // not on `hiddenRingKeys` — flipping a legend toggle must NOT restart
  // the ring-grow animation. We mirror the current set into a ref so the
  // CallbackProperty attached to each entity's `show` can read the live
  // value every frame without triggering a re-render of the React effect.
  const hiddenRingKeysRef = useRef<ReadonlySet<string>>(hiddenRingKeys);
  useEffect(() => {
    hiddenRingKeysRef.current = hiddenRingKeys;
    // Cesium runs in request-render mode in some configurations; nudge
    // the scene so a toggle takes effect on the very next frame even
    // when the camera is idle.
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [hiddenRingKeys]);

  // Fetch a real elevation tile (AWS terrarium, zoom 8) for every
  // location the user picks. The resulting grid feeds the Wald &
  // Allen 2007 Vs30 proxy for earthquakes AND the Synolakis coastal
  // slope for tsunami run-up — replacing the default 760 m/s rock
  // reference and the 1:100 textbook beach slope with site values.
  useEffect(() => {
    if (location === null) return;
    let cancelled = false;
    terrainPulsingRef.current = true;
    fetchTerrainGridForLocation(location.latitude, location.longitude)
      .then((grid) => {
        if (!cancelled) setElevationGrid(grid);
      })
      .catch((err: unknown) => {
        // Silent fallback: no grid loaded → Vs30 stays at 760, the
        // uniform-depth tsunami model falls back. Log once so devs
        // see network failures without scaring the user.
        console.warn('[Globe] terrain tile fetch failed, falling back to defaults:', err);
      })
      .finally(() => {
        if (!cancelled) terrainPulsingRef.current = false;
      });
    return () => {
      cancelled = true;
      terrainPulsingRef.current = false;
    };
  }, [location, setElevationGrid]);

  // --- Viewer lifecycle ------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Viewer | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    // Cesium reaches into OffscreenCanvas and other browser APIs that
    // not every engine exposes in its dev-build configuration (WebKit
    // in particular). Swallow init failures so the surrounding
    // SimulatorPanel / About / Glossary overlay still mounts and the
    // user can at least interact with the scenario controls.
    try {
      viewer = new Viewer(container, {
        animation: false,
        baseLayerPicker: false,
        baseLayer: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
      });

      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({
          url: OSM_TILE_URL,
          credit: OSM_ATTRIBUTION,
          maximumLevel: 19,
        })
      );

      // Live solar illumination: the globe is shaded by the sun's real
      // position at the clock's current time. When a location is later
      // picked, `viewer.clock.currentTime` is anchored to the local
      // solar noon of that longitude (see `localSolarNoonForLongitude`)
      // so the event point is always lit AND every visitor opening
      // the same URL sees the same lighting state. The night fade
      // distances are stretched so the terminator stays visible at the
      // wide camera framings the simulator uses for global-scale events
      // (Tōhoku tsunami, Chicxulub thermal pulse, …) instead of the
      // day-side hemisphere washing out into uniform daylight.
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.nightFadeOutDistance = 40_000_000;
      viewer.scene.globe.nightFadeInDistance = 100_000_000;
      // Modest atmosphere boost — the default `10` reads flat next
      // to the bright OSM imagery; bumping to 12 gives the lit side a
      // slightly richer "Apollo image" sheen without sliding into the
      // saturated-postcard look the art-direction doc rules out.
      viewer.scene.globe.atmosphereLightIntensity = 12;
      // Limb atmosphere: a touch more saturated, a touch dimmer so
      // the day–night terminator carries more visible depth. Cesium
      // types `skyAtmosphere` as optional because some build modes
      // strip it; in our default Viewer config it is always present.
      if (viewer.scene.skyAtmosphere !== undefined) {
        viewer.scene.skyAtmosphere.saturationShift = 0.1;
        viewer.scene.skyAtmosphere.brightnessShift = -0.05;
      }

      handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
        const activeViewer = viewerRef.current;
        if (!activeViewer || activeViewer.isDestroyed()) return;

        // Click-through aftershock detail: when the user clicks a
        // dot in the post-mainshock cloud we pin that aftershock
        // instead of shifting the epicentre. drillPick walks every
        // pickable at the cursor, so the dot is preferred over the
        // imagery layer behind it.
        const picks = activeViewer.scene.drillPick(event.position);
        for (const p of picks) {
          const pickedId = (p as { id?: { id?: unknown } | undefined }).id?.id;
          if (typeof pickedId === 'string' && pickedId.startsWith(AFTERSHOCK_ID_PREFIX)) {
            const idxString = pickedId.slice(AFTERSHOCK_ID_PREFIX.length);
            const idx = Number.parseInt(idxString, 10);
            if (Number.isFinite(idx) && idx >= 0) {
              selectAftershock(idx);
              return;
            }
          }
        }

        // Empty-globe click: shift the simulation epicentre (which
        // also clears any pinned aftershock — see store action).
        const cartesian = viewer?.camera.pickEllipsoid(
          event.position,
          viewer.scene.globe.ellipsoid
        );
        if (!cartesian) return;
        const carto = Cartographic.fromCartesian(cartesian);
        const coords: Coordinates = {
          latitude: CesiumMath.toDegrees(carto.latitude),
          longitude: CesiumMath.toDegrees(carto.longitude),
        };
        setLocation(coords);
      }, ScreenSpaceEventType.LEFT_CLICK);

      // Hover tooltip: track the cursor and resolve picked entities to
      // plain-language ring / aftershock descriptions.
      //   - Position update is a direct DOM mutation (no React render).
      //   - Content swap goes through `setHoverInfo`, which only fires
      //     when the picked entity actually changes (reference compare).
      //   - drillPick walks every entity at the cursor so we can pick
      //     the *smallest* containing ring rather than whichever
      //     happens to be on top — the smallest ring is the most
      //     specific damage threshold and the most useful tooltip.
      handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => {
        const activeViewer = viewerRef.current;
        if (!activeViewer || activeViewer.isDestroyed()) return;
        const tooltipEl = tooltipElRef.current;
        if (tooltipEl !== null) {
          tooltipEl.style.left = `${(event.endPosition.x + 16).toString()}px`;
          tooltipEl.style.top = `${(event.endPosition.y + 16).toString()}px`;
        }
        const picks = activeViewer.scene.drillPick(event.endPosition);
        let bestRing: HoverInfo | null = null;
        let bestRadius = Infinity;
        let aftershockHit: HoverInfo | null = null;
        for (const p of picks) {
          const pickedId = (p as { id?: { id?: unknown } | undefined }).id?.id;
          if (typeof pickedId !== 'string') continue;
          const meta = tooltipMetaRef.current.get(pickedId);
          if (!meta) continue;
          if (meta.type === 'ring' && meta.radiusM < bestRadius) {
            bestRing = meta;
            bestRadius = meta.radiusM;
          } else if (meta.type === 'aftershock' && aftershockHit === null) {
            aftershockHit = meta;
          }
        }
        const next = bestRing ?? aftershockHit;
        setHoverInfo((prev) => (prev === next ? prev : next));
      }, ScreenSpaceEventType.MOUSE_MOVE);

      viewerRef.current = viewer;

      // WebGL context-loss survival ----------------------------------
      // When the user resizes the window aggressively, switches the
      // browser to a backgrounded power-saver tab, or the GPU driver
      // hiccups, the underlying WebGL context is destroyed without a
      // JS-visible error. Without these handlers the canvas freezes
      // on its last drawn frame (or fades to a flat clear colour)
      // and the user sees no globe — but every Cesium primitive is
      // still alive in JS, so it looks like a hang. The default
      // browser behaviour for `webglcontextlost` is to NOT fire
      // `webglcontextrestored` unless we call `preventDefault()`
      // here.
      const canvasEl = viewer.scene.canvas;
      const onContextLost = (e: Event): void => {
        e.preventDefault();
        console.warn('[Globe] WebGL context lost; awaiting restoration.');
      };
      const onContextRestored = (): void => {
        console.warn('[Globe] WebGL context restored; forcing re-render.');
        const v = viewerRef.current;
        if (v && !v.isDestroyed()) {
          v.resize();
          v.scene.requestRender();
        }
      };
      canvasEl.addEventListener('webglcontextlost', onContextLost, false);
      canvasEl.addEventListener('webglcontextrestored', onContextRestored, false);

      // Cesium's MOUSE_MOVE only fires while the cursor is over the
      // canvas. When the cursor crosses into an overlay (the
      // SimulatorPanel, the ring legend, a Radix dialog) no leave
      // event reaches the screen-space handler, so the ring tooltip
      // stays stuck at its last canvas-relative position — which on
      // screen ends up sitting on top of the panel the user just
      // moved over. A DOM-level mouseleave on the canvas dismisses
      // the tooltip the moment the cursor exits the WebGL surface.
      const onCanvasLeave = (): void => {
        setHoverInfo(null);
      };
      canvasEl.addEventListener('mouseleave', onCanvasLeave, false);

      // Belt-and-braces resize observer. Cesium has its own internal
      // resize listener wired to the window-level `resize` event, but
      // it doesn't fire when the *parent container* resizes
      // independently of the window (e.g. CSS layout reflow, mobile
      // panel collapsing, devtools docking). Without this observer
      // the drawing buffer stays at the original size and primitives
      // appear to vanish even though the entities are still alive.
      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          const v = viewerRef.current;
          if (v && !v.isDestroyed()) {
            v.resize();
            v.scene.requestRender();
          }
        });
        resizeObserver.observe(container);
      }
      // Stash the cleanup hooks on the viewer so the unmount path can
      // tear them down without re-resolving the canvas reference.
      (
        viewer as Viewer & {
          __visTeardown?: () => void;
        }
      ).__visTeardown = (): void => {
        canvasEl.removeEventListener('webglcontextlost', onContextLost, false);
        canvasEl.removeEventListener('webglcontextrestored', onContextRestored, false);
        canvasEl.removeEventListener('mouseleave', onCanvasLeave, false);
        resizeObserver?.disconnect();
      };
    } catch (err) {
      // Browser can't run Cesium (e.g. Safari < 16.4 without
      // OffscreenCanvas). Log once; the rest of the app keeps working.
      console.warn('[Globe] Cesium viewer initialisation failed:', err);
      viewerRef.current = null;
      return undefined;
    }

    const cleanupViewer = viewer;
    const cleanupHandler = handler;
    return () => {
      cleanupHandler.destroy();
      // Detach the WebGL-context-loss listeners and the
      // ResizeObserver before destroying the viewer — the destroy
      // call clears the canvas reference, after which removeEventListener
      // would silently succeed against a stale element.
      const teardown = (
        cleanupViewer as Viewer & {
          __visTeardown?: () => void;
        }
      ).__visTeardown;
      if (teardown) teardown();
      cleanupViewer.destroy();
      viewerRef.current = null;
    };
  }, [setLocation, selectAftershock]);

  // --- Marker + damage rings ------------------------------------------
  // Cancel function for the currently-running ring animation; reset
  // on every re-evaluate so stale rAF loops don't keep writing into
  // entities that have been removed.
  const cancelRingAnimationRef = useRef<(() => void) | null>(null);
  // Same for the aftershock progressive-reveal loop; aftershocks live
  // longer than rings (15 s UI window vs ≤ 4 s for shockwaves) so
  // a re-evaluate while one is still mid-flight is the common case.
  const cancelAftershockAnimationRef = useRef<(() => void) | null>(null);
  // Cleanup for the impact / explosion mushroom-cloud particle VFX —
  // each spawn returns a teardown function, we hold it here and run it
  // on the next evaluate so stale particle systems don't accumulate
  // when the user re-runs a scenario or jumps between event types.
  const cancelExplosionVfxRef = useRef<(() => void) | null>(null);
  // Cleanup for the wavefront-indicator rAF loop (the bright outline
  // ring that grows linearly at the head of the cascade). Cancelled
  // on every re-evaluate so stale loops don't keep mutating an entity
  // that's about to be removed by the stale-entity sweep.
  const cancelWavefrontRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Cancel any ring animation still in flight from the previous
    // evaluate — its entities are about to be removed below.
    if (cancelRingAnimationRef.current) {
      cancelRingAnimationRef.current();
      cancelRingAnimationRef.current = null;
    }
    if (cancelAftershockAnimationRef.current) {
      cancelAftershockAnimationRef.current();
      cancelAftershockAnimationRef.current = null;
    }
    // Tear down any lingering explosion-VFX particle systems before
    // we set up the new scenario; otherwise the previous mushroom
    // cloud would keep emitting smoke through the new event's cascade.
    if (cancelExplosionVfxRef.current) {
      cancelExplosionVfxRef.current();
      cancelExplosionVfxRef.current = null;
    }
    // Same for the wavefront-indicator rAF loop — stop it before its
    // entity is removed by the stale-entity sweep below.
    if (cancelWavefrontRef.current) {
      cancelWavefrontRef.current();
      cancelWavefrontRef.current = null;
    }

    // Drop tooltip metadata that's about to belong to vanished entities,
    // and clear any in-flight hover so a stale reference doesn't survive
    // into the next scenario.
    tooltipMetaRef.current.clear();
    setHoverInfo(null);

    /** Register tooltip metadata for an entity. Called inline at every
     *  add() site so the metadata Map stays in lock-step with the
     *  Cesium entity collection. Also wires a `CallbackProperty` to the
     *  entity's `show` flag so the legend's per-row visibility toggle
     *  takes effect immediately — without rebuilding the entity (and
     *  therefore without restarting the ring-grow animation). */
    const registerRingTooltip = (
      entityId: string,
      kind: RingTooltipKind,
      radiusM: number,
      tint: Color
    ): void => {
      tooltipMetaRef.current.set(entityId, {
        type: 'ring',
        kind,
        radiusM,
        color: tint.toCssHexString(),
      });
      const entity = viewer.entities.getById(entityId);
      if (entity?.ellipse !== undefined) {
        entity.ellipse.show = new CallbackProperty(
          () => !hiddenRingKeysRef.current.has(kind),
          false
        );
      }
    };

    /** Aftershock counterpart: stores the magnitude + onset so the
     *  tooltip can show "Mw 5.4 · ≈ 2 h after the mainshock". */
    const registerAftershockTooltip = (
      entityId: string,
      magnitude: number,
      timeAfterMainshock: number,
      tint: Color
    ): void => {
      tooltipMetaRef.current.set(entityId, {
        type: 'aftershock',
        magnitude,
        timeAfterMainshock,
        color: tint.toCssHexString(),
      });
    };

    // Remove previous overlay entities (all event types).
    const existing = viewer.entities.getById(MARKER_ID);
    if (existing) viewer.entities.remove(existing);
    const existingHalo = viewer.entities.getById(MARKER_HALO_ID);
    if (existingHalo) viewer.entities.remove(existingHalo);
    (Object.keys(RING_COLORS) as (keyof ImpactDamageRadii)[]).forEach((key) => {
      const id = `${RING_ID_PREFIX}${key}`;
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    });
    const staleCavity = viewer.entities.getById(TSUNAMI_CAVITY_ID);
    if (staleCavity) viewer.entities.remove(staleCavity);
    TSUNAMI_WAVE_FRONT_IDS.forEach((id) => {
      const e = viewer.entities.getById(id);
      if (e) viewer.entities.remove(e);
    });
    MMI_RING_IDS.forEach((id) => {
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    });
    EXPLOSION_RING_IDS.forEach((id) => {
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    });
    const stalePyro = viewer.entities.getById(PYROCLASTIC_RING_ID);
    if (stalePyro) viewer.entities.remove(stalePyro);
    const staleAshfall = viewer.entities.getById(ASHFALL_PLUME_ID);
    if (staleAshfall) viewer.entities.remove(staleAshfall);
    const staleEjecta = viewer.entities.getById(EJECTA_BLANKET_ID);
    if (staleEjecta) viewer.entities.remove(staleEjecta);
    const staleWavefront = viewer.entities.getById(WAVEFRONT_INDICATOR_ID);
    if (staleWavefront) viewer.entities.remove(staleWavefront);
    const staleLateralBlast = viewer.entities.getById(LATERAL_BLAST_ID);
    if (staleLateralBlast) viewer.entities.remove(staleLateralBlast);
    const staleAftershocks = viewer.entities.values
      .filter((e) => typeof e.id === 'string' && e.id.startsWith(AFTERSHOCK_ID_PREFIX))
      .slice();
    for (const e of staleAftershocks) viewer.entities.remove(e);
    const staleHeatmap = viewer.entities.getById(FMM_HEATMAP_ID);
    if (staleHeatmap) viewer.entities.remove(staleHeatmap);
    const staleAmplitude = viewer.entities.getById(FMM_AMPLITUDE_HEATMAP_ID);
    if (staleAmplitude) viewer.entities.remove(staleAmplitude);
    const staleFuzzy = viewer.entities.values
      .filter((e) => typeof e.id === 'string' && e.id.startsWith(FUZZY_RING_ID_PREFIX))
      .slice();
    for (const e of staleFuzzy) viewer.entities.remove(e);
    // Isochrone segment IDs are keyed by their threshold and segment
    // index, so we purge every entity whose id starts with the prefix.
    const staleIsochrones = viewer.entities.values
      .filter((e) => typeof e.id === 'string' && e.id.startsWith(ISOCHRONE_ID_PREFIX))
      .slice();
    for (const e of staleIsochrones) viewer.entities.remove(e);

    if (!location) return;

    // Anchor the sun to local solar noon over the picked longitude.
    // Driven from the rendering effect (not the viewer-init effect) so
    // every click recomputes the illumination — the lighting follows
    // the user across the globe instead of freezing at the first
    // location. Determinism: the result depends only on `longitude` and
    // today's UTC date, which is identical for all visitors opening the
    // same URL within the same day.
    viewer.clock.currentTime = localSolarNoonForLongitude(location.longitude);

    const centerCartesian = Cartesian3.fromDegrees(location.longitude, location.latitude);
    /** Accumulates ring-animation specs as we register entities with
     *  initial semiMajor/Minor = 0. After every branch has added its
     *  entities we fire `animateRingsImperatively(specs)` to ramp
     *  them all from 0 to the final radius in one coordinated pass. */
    const ringSpecs: RingAnimationSpec[] = [];
    const scheduleRing = (
      entity: Entity,
      kind: RingKind,
      semiMajor: number,
      semiMinor?: number
    ): void => {
      const spec: RingAnimationSpec = { entity, kind, finalSemiMajor: semiMajor };
      if (semiMinor !== undefined) spec.finalSemiMinor = semiMinor;
      ringSpecs.push(spec);
    };

    /**
     * Resolve a {@link RingAsymmetry} record produced by Layer 2 into
     * the four numbers a Cesium ellipse needs to render the asymmetric
     * shape: a shifted geographic centre, the two ramped axes, and
     * the rotation angle.
     *
     * Compass azimuth (CW from North) is converted to Cesium's
     * counter-clockwise-from-East (`cesiumRotation = π/2 − azimuthRad`).
     * The 1° = 111 km approximation matches the existing inline
     * pattern used for the ejecta blanket and the ashfall plume.
     */
    const computeAsymmetricGeometry = (
      asymmetry: RingAsymmetry,
      nominalRadius: number,
      centerLat: number,
      centerLon: number
    ): {
      position: Cartesian3;
      semiMajor: number;
      semiMinor: number;
      cesiumRotation: number;
    } => {
      const azimuthRad = (asymmetry.azimuthDeg * Math.PI) / 180;
      const semiMajor = nominalRadius * asymmetry.semiMajorMultiplier;
      const semiMinor = nominalRadius * asymmetry.semiMinorMultiplier;
      const offset = asymmetry.centerOffsetMeters;
      const latRad = (centerLat * Math.PI) / 180;
      const dLat = offset === 0 ? 0 : (offset * Math.cos(azimuthRad)) / 111_000;
      const dLon =
        offset === 0
          ? 0
          : (offset * Math.sin(azimuthRad)) / (111_000 * Math.max(Math.cos(latRad), 1e-6));
      return {
        position: Cartesian3.fromDegrees(centerLon + dLon, centerLat + dLat),
        semiMajor,
        semiMinor,
        cesiumRotation: Math.PI / 2 - azimuthRad,
      };
    };

    /**
     * Paint three concentric tsunami wave-front rings around the
     * source at the radii where the open-ocean amplitude drops to
     * 5 m / 1 m / 0.3 m. Outline-only (fill: false) so they read as
     * propagating wave fronts, not as filled damage zones. Each ring
     * is registered in the hover-tooltip map so the user gets a
     * plain-language explanation of "what happens at this distance"
     * when the cursor lands on the contour.
     *
     * Two amplitude-vs-distance laws cover every tsunami source we
     * simulate:
     *   - Cavity-collapse (Ward & Asphaug 2000) for impact, explosion,
     *     volcano-collapse, and submarine-landslide sources:
     *         A(r) = A₀ · R_C / r          ⇒  r = A₀ · R_C / A_target
     *   - Cylindrical line-source (Hanks-Kanamori → Okada → 1/√r) for
     *     megathrust earthquakes:
     *         A(r) = A₀ · √(R₀ / r)        ⇒  r = R₀ · (A₀ / A_target)²
     *     with R₀ = ruptureLength / 2 (the half-length of the fault).
     *
     * Rings whose computed radius would exceed the great-circle
     * antipode (≈ π·R_E) are clamped via {@link clampToGreatCircle};
     * rings that remain below the source-cavity radius (i.e. the
     * amplitude target is *higher* than the source amplitude itself)
     * are skipped — they do not exist physically.
     */
    type TsunamiSourceMode =
      | { mode: 'cavity'; sourceAmplitude: number; cavityRadius: number }
      | { mode: 'cylindrical'; sourceAmplitude: number; halfLength: number };
    const addTsunamiWaveFronts = (source: TsunamiSourceMode): void => {
      const targets: {
        id: (typeof TSUNAMI_WAVE_FRONT_IDS)[number];
        amplitude: number;
        color: Color;
        tooltipKind: RingTooltipKind;
      }[] = [
        {
          id: 'tsunami-wavefront-5m',
          amplitude: 5,
          color: TSUNAMI_WAVE_FRONT_5M_COLOR,
          tooltipKind: 'tsunamiWaveFront5m',
        },
        {
          id: 'tsunami-wavefront-1m',
          amplitude: 1,
          color: TSUNAMI_WAVE_FRONT_1M_COLOR,
          tooltipKind: 'tsunamiWaveFront1m',
        },
        {
          id: 'tsunami-wavefront-03m',
          amplitude: 0.3,
          color: TSUNAMI_WAVE_FRONT_03M_COLOR,
          tooltipKind: 'tsunamiWaveFront03m',
        },
      ];
      // Per-tier alpha schedule. The 5 m ring (innermost, most
      // severe) gets the highest fill so it reads with visual
      // weight; the 0.3 m ring (outermost, mildest) is the most
      // translucent so the eye reads inward → outward as
      // intensifying. Cesium's WebGL line drawing ignores
      // `outlineWidth` on most consumer browsers (the value clamps
      // to the GPU's `ALIASED_LINE_WIDTH_RANGE`, typically [1, 1]),
      // so an outline-only ring renders as a one-pixel hairline
      // regardless of what we request. The fill below gives the
      // band the body it needs to read as a wave; the outline
      // colour stays at high alpha to anchor the rim.
      const tierFillAlpha = [0.32, 0.22, 0.14] as const;
      const tierOutlineAlpha = [0.95, 0.9, 0.8] as const;
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (target === undefined) continue;
        if (source.sourceAmplitude <= 0) continue;
        if (source.sourceAmplitude < target.amplitude) continue; // never reached
        let radius: number;
        if (source.mode === 'cavity') {
          if (source.cavityRadius <= 0) continue;
          radius = (source.sourceAmplitude * source.cavityRadius) / target.amplitude;
        } else {
          if (source.halfLength <= 0) continue;
          const ratio = source.sourceAmplitude / target.amplitude;
          radius = source.halfLength * ratio * ratio;
        }
        const clampedRadius = clampToGreatCircle(radius);
        if (!Number.isFinite(clampedRadius) || clampedRadius <= 0) continue;
        const fillAlpha = tierFillAlpha[i] ?? 0.18;
        const outlineAlpha = tierOutlineAlpha[i] ?? 0.85;
        const entity = viewer.entities.add({
          id: target.id,
          position: centerCartesian,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            // `radialDamageMaterial` paints a soft radial gradient —
            // brightest at the rim, fading toward the centre. That
            // is exactly the "expanding wave-front, brighter near
            // the edge" percept we want, and it does not depend on
            // `outlineWidth` so the band stays visible on every
            // browser.
            material: radialDamageMaterial(target.color, fillAlpha),
            outline: true,
            outlineColor: target.color.withAlpha(outlineAlpha),
            outlineWidth: 4,
            height: 0,
          },
        });
        scheduleRing(entity, 'tsunamiCavity', clampedRadius);
        registerRingTooltip(target.id, target.tooltipKind, clampedRadius, target.color);
      }
    };

    // Bullseye marker: a tight gold core dot wrapped in a faint
    // gold halo. Two entities so the halo can render with a
    // transparent fill (Cesium points don't allow per-channel alpha
    // on the fill of a single primitive without flickering against
    // the OSM imagery).
    //
    // The halo's outline alpha is wired through a CallbackProperty
    // that breathes (sinusoidally pulses 0.25 → 0.85) while the
    // terrain tile is in-flight, then settles to a steady 0.5 once
    // the fetch resolves. Free "we're working on it" signal that
    // doesn't need a separate DOM spinner.
    const haloOutline = new CallbackProperty(() => {
      if (!terrainPulsingRef.current) return MARKER_COLOR.withAlpha(0.5);
      const t = (Date.now() % 1_400) / 1_400;
      const alpha = 0.55 + 0.3 * Math.sin(t * Math.PI * 2);
      return MARKER_COLOR.withAlpha(alpha);
    }, false);
    viewer.entities.add({
      id: MARKER_HALO_ID,
      position: centerCartesian,
      point: {
        pixelSize: 18,
        color: MARKER_COLOR.withAlpha(0.0),
        outlineColor: haloOutline,
        outlineWidth: 1.5,
      },
    });
    viewer.entities.add({
      id: MARKER_ID,
      position: centerCartesian,
      point: {
        pixelSize: 8,
        color: MARKER_COLOR,
        outlineColor: Color.WHITE.withAlpha(0.55),
        outlineWidth: 1.5,
      },
    });

    if (!result) return;

    // --- Impact: 4 damage rings + optional tsunami cavity ------------
    if (result.type === 'impact') {
      const radii = result.data.damage;
      const asymmetries = result.data.damageAsymmetry;
      const impactRingKind: Record<keyof ImpactDamageRadii, RingKind> = {
        craterRim: 'crater',
        thirdDegreeBurn: 'thermal',
        secondDegreeBurn: 'thermal',
        overpressure5psi: 'overpressure',
        overpressure1psi: 'overpressure',
        lightDamage: 'overpressure',
      };
      (Object.keys(RING_COLORS) as (keyof ImpactDamageRadii)[]).forEach((key) => {
        const radius = radii[key] as number;
        if (!Number.isFinite(radius) || radius <= 0) return;
        const entityId = `${RING_ID_PREFIX}${key}`;
        // Per-ring asymmetry: oblique impacts elongate downrange and
        // shrink cross-range per Pierazzo & Melosh / Pierazzo &
        // Artemieva envelopes. The geometry helper folds in the
        // azimuthal rotation and the centre offset.
        const geom = computeAsymmetricGeometry(
          asymmetries[key],
          radius,
          location.latitude,
          location.longitude
        );
        const entity = viewer.entities.add({
          id: entityId,
          position: geom.position,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            rotation: geom.cesiumRotation,
            material: radialDamageMaterial(RING_COLORS[key], 0.85),
            outline: true,
            outlineColor: RING_COLORS[key].withAlpha(0.5),
            height: 0,
          },
        });
        scheduleRing(entity, impactRingKind[key], geom.semiMajor, geom.semiMinor);
        // Tooltip continues to report the NOMINAL ground-range radius
        // (not the elongated semi-major) — that is what is
        // scientifically meaningful and what the tooltip text claims
        // ("crater rim 8.5 km"). The asymmetric on-screen shape is
        // a rendering refinement, not a different physical quantity.
        registerRingTooltip(entityId, key, radius, RING_COLORS[key]);
      });
      if (result.data.tsunami) {
        const cavityRadius = result.data.tsunami.cavityRadius as number;
        if (Number.isFinite(cavityRadius) && cavityRadius > 0) {
          const entity = viewer.entities.add({
            id: TSUNAMI_CAVITY_ID,
            position: centerCartesian,
            ellipse: {
              semiMajorAxis: 0,
              semiMinorAxis: 0,
              material: radialDamageMaterial(TSUNAMI_CAVITY_COLOR, 0.65),
              outline: true,
              outlineColor: TSUNAMI_CAVITY_COLOR.withAlpha(0.45),
              height: 0,
            },
          });
          scheduleRing(entity, 'tsunamiCavity', cavityRadius);
          registerRingTooltip(
            TSUNAMI_CAVITY_ID,
            'tsunamiCavity',
            cavityRadius,
            TSUNAMI_CAVITY_COLOR
          );
        }
        addTsunamiWaveFronts({
          mode: 'cavity',
          sourceAmplitude: result.data.tsunami.sourceAmplitude,
          cavityRadius: result.data.tsunami.cavityRadius,
        });
      }

      // --- Impact ejecta blanket: asymmetric ellipse offset downrange.
      // Schultz & Anderson (1996) oblique-impact asymmetry: the ellipse
      // stretches along the impactor's downrange azimuth and slides
      // forward by the same amount, producing the "butterfly" pattern
      // visible at θ < 30° while staying near-circular for steep
      // impacts (asymmetryFactor → 0 above 45°).
      const blanketRadius = result.data.ejecta.blanketEdge1mm as number;
      if (Number.isFinite(blanketRadius) && blanketRadius > 0) {
        const f = result.data.ejecta.asymmetryFactor;
        const azimuthRad = (result.data.ejecta.azimuthDeg * Math.PI) / 180;
        const offsetMeters = result.data.ejecta.downrangeOffset as number;
        const semiMajor = blanketRadius * (1 + 0.4 * f);
        const semiMinor = blanketRadius * (1 - 0.25 * f);
        // Convert (north, east) offset in metres to lat/lon deltas.
        const latRad = (location.latitude * Math.PI) / 180;
        const northOffsetDeg = (offsetMeters * Math.cos(azimuthRad)) / 111_000;
        const eastOffsetDeg =
          (offsetMeters * Math.sin(azimuthRad)) / (111_000 * Math.max(Math.cos(latRad), 1e-6));
        const blanketLat = location.latitude + northOffsetDeg;
        const blanketLon = location.longitude + eastOffsetDeg;
        // Cesium ellipse rotation: CCW from East (+x). Azimuth is CW
        // from North → cesiumRotation = π/2 − azimuthRad.
        const cesiumRotation = Math.PI / 2 - azimuthRad;
        // Ejecta blanket joins the ring cascade so it grows from
        // r=0 to its asymmetric ellipse instead of popping in at
        // full size on the same frame the result lands. The
        // asymmetric semi-major / semi-minor pair is honored by
        // the animator just like every other ring.
        const ejectaEntity = viewer.entities.add({
          id: EJECTA_BLANKET_ID,
          position: Cartesian3.fromDegrees(blanketLon, blanketLat),
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            rotation: cesiumRotation,
            material: radialDamageMaterial(EJECTA_BLANKET_COLOR, 0.7),
            outline: true,
            outlineColor: EJECTA_BLANKET_COLOR.withAlpha(0.45),
            height: 0,
          },
        });
        // Use the 'crater' kind so the ejecta reveals on the same
        // ~300 ms beat as the crater rim — they're the same physical
        // event (excavation) and visually belong together.
        scheduleRing(
          ejectaEntity,
          'crater',
          clampToGreatCircle(semiMajor),
          clampToGreatCircle(semiMinor)
        );
        registerRingTooltip(
          EJECTA_BLANKET_ID,
          'ejectaBlanket',
          blanketRadius,
          EJECTA_BLANKET_COLOR
        );
      }
    }

    // --- Earthquake: aftershock point cloud ------------------------
    if (result.type === 'earthquake' && result.data.aftershocks.events.length > 0) {
      const latRad = (location.latitude * Math.PI) / 180;
      const cosLat = Math.max(Math.cos(latRad), 1e-6);
      const bath = result.data.aftershocks.bathCeiling;
      const mc = result.data.aftershocks.completenessCutoff;
      const span = Math.max(bath - mc, 0.1);
      const aftershockSpecs: AftershockAnimationSpec[] = [];
      result.data.aftershocks.events.forEach((event, idx) => {
        const dlat = (event.northOffsetM as number) / 111_000;
        const dlon = (event.eastOffsetM as number) / (111_000 * cosLat);
        // Linearly interpolate colour and pixel size between Mc and
        // the Båth ceiling — a magnitude-3 dot stays small and pale,
        // an M(main−1.5) dot stands out as a deep red marker.
        const t = Math.max(0, Math.min(1, (event.magnitude - mc) / span));
        const color = Color.lerp(AFTERSHOCK_COLOR_LOW, AFTERSHOCK_COLOR_HIGH, t, new Color());
        const pixelSize = 4 + 8 * t;
        const entityId = `${AFTERSHOCK_ID_PREFIX}${idx.toString()}`;
        const entity = viewer.entities.add({
          id: entityId,
          position: Cartesian3.fromDegrees(location.longitude + dlon, location.latitude + dlat),
          point: {
            // animateAftershocksImperatively flips show=true at the
            // log-compressed onset; we start hidden so the loop owns
            // the reveal.
            show: false,
            pixelSize,
            color: color.withAlpha(0.85),
            outlineColor: Color.BLACK,
            outlineWidth: 1,
          },
        });
        aftershockSpecs.push({
          entity,
          physicalTimeSeconds: event.timeAfterMainshock,
          finalPixelSize: pixelSize,
        });
        registerAftershockTooltip(entityId, event.magnitude, event.timeAfterMainshock, color);
      });
      cancelAftershockAnimationRef.current = animateAftershocksImperatively(aftershockSpecs);
    }

    // --- Earthquake: three MMI felt-intensity contours ---------------
    if (result.type === 'earthquake') {
      const { mmi7Radius, mmi8Radius, mmi9Radius } = result.data.shaking;
      const contours: { id: (typeof MMI_RING_IDS)[number]; radius: number; color: Color }[] = [
        { id: 'mmi-ring-7', radius: mmi7Radius, color: MMI_RING_COLORS.mmi7 },
        { id: 'mmi-ring-8', radius: mmi8Radius, color: MMI_RING_COLORS.mmi8 },
        { id: 'mmi-ring-9', radius: mmi9Radius, color: MMI_RING_COLORS.mmi9 },
      ];
      const mmiKindFor: Record<(typeof MMI_RING_IDS)[number], RingTooltipKind> = {
        'mmi-ring-7': 'mmi7',
        'mmi-ring-8': 'mmi8',
        'mmi-ring-9': 'mmi9',
      };
      // Submarine epicentres: the felt-intensity radii remain
      // physically valid (Joyner-Boore is a magnitude/distance
      // attenuation; both are well-defined under water) but on the
      // open ocean the contours have no built environment to act on
      // and the dominant story is the tsunami. Fade the rings down
      // (0.85 → 0.35) so the eye reads "land sites within this radius
      // get this MMI", not "the water is shaking at MMI VIII". The
      // tsunami amplitude/isochrone heatmaps painted further down
      // own the rest of the visual budget.
      const isSubmarine = result.data.isSubmarine;
      const fillAlpha = isSubmarine ? 0.35 : 0.85;
      const outlineAlpha = isSubmarine ? 0.25 : 0.5;
      contours.forEach(({ id, radius, color }) => {
        if (!Number.isFinite(radius) || radius <= 0) return;
        const entity = viewer.entities.add({
          id,
          position: centerCartesian,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            material: radialDamageMaterial(color, fillAlpha),
            outline: true,
            outlineColor: color.withAlpha(outlineAlpha),
            height: 0,
          },
        });
        scheduleRing(entity, 'mmi', radius);
        registerRingTooltip(id, mmiKindFor[id], radius, color);
      });
    }

    // --- Explosion: blast / burn / crater rings + radiation / EMP ----
    if (result.type === 'explosion') {
      const blast = result.data.blast;
      const thermal = result.data.thermal;
      const crater = result.data.crater;
      const radiation = result.data.radiation;
      const emp = result.data.emp;
      const asymmetry = result.data.asymmetry;
      const explosionRings: {
        id: (typeof EXPLOSION_RING_IDS)[number];
        radius: number;
        color: Color;
        kind: RingKind;
        tooltipKind: RingTooltipKind;
        asymmetry: RingAsymmetry;
      }[] = [
        {
          id: 'explosion-crater',
          radius: crater.apparentDiameter / 2,
          color: RING_COLORS.craterRim,
          kind: 'crater',
          tooltipKind: 'craterRim',
          asymmetry: asymmetry.crater,
        },
        {
          id: 'explosion-thermal',
          radius: thermal.thirdDegreeBurnRadius,
          color: RING_COLORS.thirdDegreeBurn,
          kind: 'thermal',
          tooltipKind: 'thirdDegreeBurn',
          asymmetry: asymmetry.thermal,
        },
        {
          id: 'explosion-thermal-2nd',
          radius: thermal.secondDegreeBurnRadius,
          color: RING_COLORS.secondDegreeBurn,
          kind: 'thermal',
          tooltipKind: 'secondDegreeBurn',
          asymmetry: asymmetry.secondDegreeBurn,
        },
        {
          id: 'explosion-5psi',
          radius: blast.overpressure5psiRadius,
          color: RING_COLORS.overpressure5psi,
          kind: 'overpressure',
          tooltipKind: 'overpressure5psi',
          asymmetry: asymmetry.overpressure5psi,
        },
        {
          id: 'explosion-1psi',
          radius: blast.overpressure1psiRadius,
          color: RING_COLORS.overpressure1psi,
          kind: 'overpressure',
          tooltipKind: 'overpressure1psi',
          asymmetry: asymmetry.overpressure1psi,
        },
        {
          id: 'explosion-light-damage',
          radius: blast.lightDamageRadius,
          color: RING_COLORS.lightDamage,
          kind: 'overpressure',
          tooltipKind: 'lightDamage',
          asymmetry: asymmetry.lightDamage,
        },
      ];

      // Initial-radiation lethal-dose ring (Glasstone §8 / UNSCEAR
      // 2000). Drawn only when LD50 actually escapes the fireball;
      // for very large yields the prompt-radiation envelope is
      // dwarfed by thermal so the ring is conventionally suppressed.
      if (Number.isFinite(radiation.ld50Radius) && radiation.ld50Radius > 0) {
        explosionRings.push({
          id: 'explosion-radiation-ld50',
          radius: radiation.ld50Radius,
          color: RADIATION_LD50_COLOR,
          // Treat as an "overpressure"-class arrival in the cascade
          // animation — radiation is essentially light-speed at our
          // 0–4 s compressed timescale, so the same near-instant
          // expansion timing is appropriate.
          kind: 'thermal',
          tooltipKind: 'radiationLD50',
          asymmetry: ISOTROPIC_RING,
        });
      }

      // EMP affected-electronics footprint (Glasstone §11 / IEC
      // 61000-2-9). Negligible-regime bursts (low-altitude, small
      // yield) fall here; HEMP detonations like Starfish Prime
      // produce continent-scale EMP rings.
      if (
        emp.regime !== 'NEGLIGIBLE' &&
        Number.isFinite(emp.affectedRadius) &&
        emp.affectedRadius > 0
      ) {
        explosionRings.push({
          id: 'explosion-emp',
          radius: emp.affectedRadius,
          color: EMP_AFFECTED_COLOR,
          // EMP propagates at light-speed too — keep it in the
          // "thermal" cinematic bucket alongside the burn rings.
          kind: 'thermal',
          tooltipKind: 'empAffected',
          asymmetry: ISOTROPIC_RING,
        });
      }
      // Contact-water surface bursts — Glasstone & Dolan §6 — couple
      // only ≈ 5–15 % of the yield into the atmosphere, so the
      // overpressure / thermal / crater radii emitted from the
      // baseline land formulas drastically overstate the airborne
      // reach. The published radii are still rendered (a follow-up
      // will scale them with the Glasstone Tab 6.31 coupling factor)
      // but at reduced opacity so the eye reads the tsunami branch
      // as the headline. The hover tooltip continues to surface the
      // numerical radius for users who want the land-equivalent
      // reference.
      const isContactWaterBurst = result.data.isContactWaterBurst;
      const explosionFillAlpha = isContactWaterBurst ? 0.4 : 0.85;
      const explosionOutlineAlpha = isContactWaterBurst ? 0.3 : 0.5;
      explosionRings.forEach(({ id, radius, color, kind, tooltipKind, asymmetry: asym }) => {
        if (!Number.isFinite(radius) || radius <= 0) return;
        // Surface-burst nuclear/conventional explosions are rotationally
        // symmetric in still air — the asymmetry block is ISOTROPIC by
        // default and only the thermal ring drifts when a positive wind
        // is supplied (Glasstone & Dolan §7.20). The same geometry
        // helper applies regardless: it short-circuits to a centred
        // circle when the multipliers are 1 and the offset is 0.
        const geom = computeAsymmetricGeometry(asym, radius, location.latitude, location.longitude);
        const entity = viewer.entities.add({
          id,
          position: geom.position,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            rotation: geom.cesiumRotation,
            material: radialDamageMaterial(color, explosionFillAlpha),
            outline: true,
            outlineColor: color.withAlpha(explosionOutlineAlpha),
            height: 0,
          },
        });
        scheduleRing(entity, kind, geom.semiMajor, geom.semiMinor);
        registerRingTooltip(id, tooltipKind, radius, color);
      });
      // Underwater / contact-water burst cavity. Same colour as the
      // impact-tsunami cavity so the two cascades read as the same
      // family of phenomena on the globe.
      if (result.data.tsunami) {
        const cavityRadius = result.data.tsunami.cavityRadius as number;
        if (Number.isFinite(cavityRadius) && cavityRadius > 0) {
          const entity = viewer.entities.add({
            id: TSUNAMI_CAVITY_ID,
            position: centerCartesian,
            ellipse: {
              semiMajorAxis: 0,
              semiMinorAxis: 0,
              material: radialDamageMaterial(TSUNAMI_CAVITY_COLOR, 0.65),
              outline: true,
              outlineColor: TSUNAMI_CAVITY_COLOR.withAlpha(0.45),
              height: 0,
            },
          });
          scheduleRing(entity, 'tsunamiCavity', cavityRadius);
          registerRingTooltip(
            TSUNAMI_CAVITY_ID,
            'tsunamiCavity',
            cavityRadius,
            TSUNAMI_CAVITY_COLOR
          );
        }
        addTsunamiWaveFronts({
          mode: 'cavity',
          sourceAmplitude: result.data.tsunami.sourceAmplitude,
          cavityRadius: result.data.tsunami.cavityRadius,
        });
      }
    }

    // --- Landslide: tsunami cavity ---------------------------------
    if (result.type === 'landslide' && result.data.tsunami !== null) {
      const cavityRadius = result.data.tsunami.cavityRadius as number;
      if (Number.isFinite(cavityRadius) && cavityRadius > 0) {
        const entity = viewer.entities.add({
          id: TSUNAMI_CAVITY_ID,
          position: centerCartesian,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            material: radialDamageMaterial(TSUNAMI_CAVITY_COLOR, 0.65),
            outline: true,
            outlineColor: TSUNAMI_CAVITY_COLOR.withAlpha(0.45),
            height: 0,
          },
        });
        scheduleRing(entity, 'tsunamiCavity', cavityRadius);
        registerRingTooltip(TSUNAMI_CAVITY_ID, 'tsunamiCavity', cavityRadius, TSUNAMI_CAVITY_COLOR);
      }
      addTsunamiWaveFronts({
        mode: 'cavity',
        sourceAmplitude: result.data.tsunami.sourceAmplitude,
        cavityRadius: result.data.tsunami.cavityRadius,
      });
    }

    // --- Volcano: collapse-driven tsunami cavity --------------------
    if (result.type === 'volcano' && result.data.tsunami) {
      const cavityRadius = result.data.tsunami.cavityRadius as number;
      if (Number.isFinite(cavityRadius) && cavityRadius > 0) {
        const entity = viewer.entities.add({
          id: TSUNAMI_CAVITY_ID,
          position: centerCartesian,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            material: radialDamageMaterial(TSUNAMI_CAVITY_COLOR, 0.65),
            outline: true,
            outlineColor: TSUNAMI_CAVITY_COLOR.withAlpha(0.45),
            height: 0,
          },
        });
        scheduleRing(entity, 'tsunamiCavity', cavityRadius);
        registerRingTooltip(TSUNAMI_CAVITY_ID, 'tsunamiCavity', cavityRadius, TSUNAMI_CAVITY_COLOR);
      }
      addTsunamiWaveFronts({
        mode: 'cavity',
        sourceAmplitude: result.data.tsunami.sourceAmplitude,
        cavityRadius: result.data.tsunami.cavityRadius,
      });
    }

    // --- Earthquake: cylindrical-line-source wave fronts ------------
    // Subduction-interface megathrust seeds a wave train whose
    // amplitude decays as A₀·√(R₀/r) (line-source spreading) rather
    // than the cavity-collapse 1/r law. We paint the same three
    // wave-front rings using the cylindrical formula.
    if (result.type === 'earthquake' && result.data.tsunami !== undefined) {
      addTsunamiWaveFronts({
        mode: 'cylindrical',
        sourceAmplitude: result.data.tsunami.initialAmplitude,
        halfLength: (result.data.ruptureLength as number) / 2,
      });
    }

    // --- Volcano: pyroclastic-flow reach ring ------------------------
    const pyroRadius = result.type === 'volcano' ? result.data.pyroclasticRunout : 0;
    if (result.type === 'volcano' && Number.isFinite(pyroRadius) && pyroRadius > 0) {
      const entity = viewer.entities.add({
        id: PYROCLASTIC_RING_ID,
        position: centerCartesian,
        ellipse: {
          semiMajorAxis: 0,
          semiMinorAxis: 0,
          material: radialDamageMaterial(PYROCLASTIC_RING_COLOR, 0.85),
          outline: true,
          outlineColor: PYROCLASTIC_RING_COLOR.withAlpha(0.5),
          height: 0,
        },
      });
      scheduleRing(entity, 'overpressure', pyroRadius);
      registerRingTooltip(
        PYROCLASTIC_RING_ID,
        'pyroclasticRunout',
        pyroRadius,
        PYROCLASTIC_RING_COLOR
      );
    }

    // --- Volcano: lateral-blast envelope (sector flank collapse) ---
    const lateralBlast = result.type === 'volcano' ? result.data.lateralBlast : undefined;
    if (
      result.type === 'volcano' &&
      lateralBlast !== undefined &&
      (lateralBlast.runout as number) > 0
    ) {
      const runout = lateralBlast.runout as number;
      const dirRad = (lateralBlast.directionDeg * Math.PI) / 180;
      // Render the wedge as an oriented ellipse offset half its
      // runout downrange — the same trick used for the ashfall plume
      // and the impact ejecta blanket. The crosswind axis scales with
      // sectorAngleDeg / 180 so a narrower blast looks more focused.
      const halfRange = runout / 2;
      const crosswindHalfWidth =
        runout * Math.sin(((lateralBlast.sectorAngleDeg / 2) * Math.PI) / 180);
      const latRad = (location.latitude * Math.PI) / 180;
      const northOffsetDeg = (halfRange * Math.cos(dirRad)) / 111_000;
      const eastOffsetDeg =
        (halfRange * Math.sin(dirRad)) / (111_000 * Math.max(Math.cos(latRad), 1e-6));
      const blastLat = location.latitude + northOffsetDeg;
      const blastLon = location.longitude + eastOffsetDeg;
      const cesiumRotation = Math.PI / 2 - dirRad;
      viewer.entities.add({
        id: LATERAL_BLAST_ID,
        position: Cartesian3.fromDegrees(blastLon, blastLat),
        ellipse: {
          semiMajorAxis: clampToGreatCircle(halfRange),
          semiMinorAxis: clampToGreatCircle(crosswindHalfWidth),
          rotation: cesiumRotation,
          material: radialDamageMaterial(LATERAL_BLAST_COLOR, 0.9),
          outline: true,
          outlineColor: LATERAL_BLAST_COLOR.withAlpha(0.55),
          height: 0,
        },
      });
      registerRingTooltip(LATERAL_BLAST_ID, 'lateralBlast', runout, LATERAL_BLAST_COLOR);
    }

    // --- Volcano: wind-advected ashfall plume -----------------------
    const ashfall = result.type === 'volcano' ? result.data.windAdvectedAshfall : undefined;
    if (
      result.type === 'volcano' &&
      ashfall !== undefined &&
      (ashfall.downwindRange as number) > 0 &&
      (ashfall.crosswindHalfWidth as number) > 0
    ) {
      const downwind = ashfall.downwindRange as number;
      const crosswind = ashfall.crosswindHalfWidth as number;
      const windDirRad = (ashfall.windDirectionDegrees * Math.PI) / 180;
      // Offset the ellipse centre half-way along the wind direction so
      // the plume extends from ~vent to vent + downwindRange.
      const halfRange = downwind / 2;
      // Convert (north, east) offsets in metres to lat/lon deltas.
      const latRad = (location.latitude * Math.PI) / 180;
      const northOffsetDeg = (halfRange * Math.cos(windDirRad)) / 111_000;
      const eastOffsetDeg =
        (halfRange * Math.sin(windDirRad)) / (111_000 * Math.max(Math.cos(latRad), 1e-6));
      const plumeLat = location.latitude + northOffsetDeg;
      const plumeLon = location.longitude + eastOffsetDeg;
      // Cesium ellipse rotation is counter-clockwise from East (+x).
      // Wind direction is clockwise from North. Convert: ccwFromEast =
      // π/2 − windDirRad.
      const cesiumRotation = Math.PI / 2 - windDirRad;
      viewer.entities.add({
        id: ASHFALL_PLUME_ID,
        position: Cartesian3.fromDegrees(plumeLon, plumeLat),
        ellipse: {
          semiMajorAxis: clampToGreatCircle(halfRange),
          semiMinorAxis: clampToGreatCircle(crosswind),
          rotation: cesiumRotation,
          material: radialDamageMaterial(ASHFALL_PLUME_COLOR, 0.55),
          outline: true,
          outlineColor: ASHFALL_PLUME_COLOR.withAlpha(0.5),
          height: 0,
        },
      });
      registerRingTooltip(ASHFALL_PLUME_ID, 'ashfallPlume', downwind, ASHFALL_PLUME_COLOR);
    }

    // --- Tsunami isochrones (FMM) ----------------------------------
    // When the scenario triggered a tsunami AND a bathymetric grid
    // was loaded, the store orchestrator fills bathymetricTsunami
    // with the Fast-Marching arrival-time polylines. Render each
    // threshold as a coloured polyline; colour ramp matches the
    // DEFAULT_ISOCHRONE_HOURS 1/2/4/8 h cadence.
    let isochroneReach = 0;
    if (bathymetricTsunami !== null) {
      // Dense heatmap of the raw arrival-time field — underlays the
      // four isochrone polylines so the user sees BOTH the contour
      // bands AND the continuous gradient between them. Ignored
      // cells (land, too-shallow) stay transparent so the OSM
      // imagery shows through.
      const grid = useAppStore.getState().elevationGrid;
      const field = bathymetricTsunami.field;
      // Cesium Rectangle.fromDegrees enforces lon ∈ [−180, 180] and
      // lat ∈ [−90, 90]. Normalise via modular arithmetic so grids
      // that happen to use 200°E (= −160°) still render — Cesium
      // handles antimeridian crossing when east < west.
      const normLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;
      if (
        grid !== null &&
        Number.isFinite(grid.minLat) &&
        Number.isFinite(grid.maxLat) &&
        Math.abs(grid.minLat) <= 90 &&
        Math.abs(grid.maxLat) <= 90
      ) {
        try {
          // Layered tsunami opacity hierarchy: the arrival-time map
          // is the *background* layer (where + when), the amplitude
          // map sits on top (how big), and the isochrone polylines
          // are the sharp reference contours. Each step down the
          // stack drops opacity so the polylines stay legible
          // against the heatmap soup.
          // Lower opacity than before (0.3 → 0.18) so the rectangular
          // grid bbox does not read as a "yellow square" against the
          // OSM imagery. The viridis tail at the lowest values now
          // fades almost to invisibility, leaving the wave-front
          // rings + isochrone polylines as the primary cues.
          const heatmap = renderScalarFieldHeatmap(field.arrivalTimes, field.nLat, field.nLon, {
            colormap: 'viridis',
            opacity: 0.18,
            transparentBelow: 0,
          });
          viewer.entities.add({
            id: FMM_HEATMAP_ID,
            rectangle: {
              coordinates: Rectangle.fromDegrees(
                normLon(grid.minLon),
                grid.minLat,
                normLon(grid.maxLon),
                grid.maxLat
              ),
              material: new ImageMaterialProperty({
                image: heatmap.canvas,
                transparent: true,
              }),
              height: 0,
            },
          });
        } catch (err: unknown) {
          console.warn('[Globe] FMM heatmap render failed:', err);
        }
        // When the orchestrator passed source-amplitude metadata to the
        // FMM, the bathymetric block carries an amplitude field too —
        // overlay it as a warm "inferno" heatmap on top of the cool
        // arrival-time map so the eye reads the two layers as
        // complementary (where + when vs how big).
        if (bathymetricTsunami.amplitude !== undefined) {
          try {
            const ampField = bathymetricTsunami.amplitude;
            const ampHeatmap = renderScalarFieldHeatmap(
              ampField.amplitudes,
              ampField.nLat,
              ampField.nLon,
              {
                colormap: 'inferno',
                opacity: 0.4,
                // Bumped from 0.05 → 0.5 m: cells where the wave is
                // smaller than half a metre are not the "tsunami
                // damage" the user reads from this layer, and keeping
                // them transparent collapses the rectangular grid
                // bbox into a wave-shaped hot core. Coastal-tide-
                // gauge-only signatures (cm-scale) still surface in
                // the report panel, just not on the globe.
                transparentBelow: 0.5,
              }
            );
            viewer.entities.add({
              id: FMM_AMPLITUDE_HEATMAP_ID,
              rectangle: {
                coordinates: Rectangle.fromDegrees(
                  normLon(grid.minLon),
                  grid.minLat,
                  normLon(grid.maxLon),
                  grid.maxLat
                ),
                material: new ImageMaterialProperty({
                  image: ampHeatmap.canvas,
                  transparent: true,
                }),
                height: 0,
              },
            });
          } catch (err: unknown) {
            console.warn('[Globe] amplitude heatmap render failed:', err);
          }
        }
      }
      const fallbackColor = ISOCHRONE_COLORS[ISOCHRONE_COLORS.length - 1] ?? Color.WHITE;
      const isochroneTooltipKindFor: RingTooltipKind[] = [
        'tsunamiIsochrone1h',
        'tsunamiIsochrone2h',
        'tsunamiIsochrone4h',
        'tsunamiIsochrone8h',
      ];
      bathymetricTsunami.isochrones.forEach((band, bandIdx) => {
        const color = ISOCHRONE_COLORS[bandIdx] ?? fallbackColor;
        const tooltipKind: RingTooltipKind =
          isochroneTooltipKindFor[bandIdx] ?? 'tsunamiIsochrone8h';
        // Approximate ring radius for the band: average great-circle
        // distance from the source to every segment endpoint. Lets
        // the hover tooltip surface "≈ X km from epicentre" alongside
        // the band's onset time.
        let bandRadiusSum = 0;
        let bandRadiusCount = 0;
        band.segments.forEach((seg, segIdx) => {
          const id = `${ISOCHRONE_ID_PREFIX}${bandIdx.toString()}-${segIdx.toString()}`;
          viewer.entities.add({
            id,
            polyline: {
              positions: [
                Cartesian3.fromDegrees(seg.lon1, seg.lat1),
                Cartesian3.fromDegrees(seg.lon2, seg.lat2),
              ],
              // 2.5 → 4 px so the propagating wave fronts pop above
              // the dimmed amplitude/arrival heatmap underneath, AND
              // so the cursor target for hover tooltips is reachable
              // without nano-precision aim.
              width: 4,
              material: color.withAlpha(0.95),
            },
          });
          const latSpan1 = Math.abs(seg.lat1 - location.latitude);
          const lonSpan1 = Math.abs(seg.lon1 - location.longitude);
          const latSpan2 = Math.abs(seg.lat2 - location.latitude);
          const lonSpan2 = Math.abs(seg.lon2 - location.longitude);
          const r1 = Math.sqrt(latSpan1 * latSpan1 + lonSpan1 * lonSpan1) * 111_000;
          const r2 = Math.sqrt(latSpan2 * latSpan2 + lonSpan2 * lonSpan2) * 111_000;
          bandRadiusSum += (r1 + r2) / 2;
          bandRadiusCount += 1;
          const segReach = Math.max(latSpan1, lonSpan1, latSpan2, lonSpan2) * 111_000;
          if (segReach > isochroneReach) isochroneReach = segReach;
        });
        // Register one tooltip metadata row per segment so the hover
        // detector picks any of the band's polylines. They all carry
        // the same band-level tooltip kind and average radius, so the
        // user sees a consistent message anywhere along the front.
        const meanRadius = bandRadiusCount > 0 ? bandRadiusSum / bandRadiusCount : 0;
        band.segments.forEach((_seg, segIdx) => {
          const id = `${ISOCHRONE_ID_PREFIX}${bandIdx.toString()}-${segIdx.toString()}`;
          registerRingTooltip(id, tooltipKind, meanRadius, color);
        });
      });
    }

    // Ring animation start is deferred until after the camera fly-to
    // resolves below — see the `complete:` callback on
    // `flyToBoundingSphere`. Letting both run concurrently meant the
    // user watched the camera pull back at the same instant the rings
    // expanded, washing out the staggered cascade. The new sequence:
    //   1. camera flies to its framing (~0.6 s),
    //   2. then the cascade plays with its physical-front-stagger.
    // Scenes with no frame radius (no positive ring outputs) fall
    // through to the immediate-start branch in the camera block.

    // --- Monte-Carlo fuzzy bounds (P10/P90 around the nominal P50) -
    // When the user has run the MC sweep, draw two faint extra rings
    // per representative metric: an inner P10 (optimistic) and an
    // outer P90 (pessimistic). Alpha is intentionally low (0.10 fill,
    // 0.4 outline) so the bands read as "uncertainty halo", not as
    // additional damage zones. We render at most two metric pairs
    // per event type to keep the globe legible.
    if (monteCarlo !== null && monteCarlo.type === result.type) {
      const fuzzyMetrics = pickFuzzyMetrics(monteCarlo);
      fuzzyMetrics.forEach((spec, idx) => {
        const drawBand = (suffix: string, radius: number, color: Color, alpha: number): void => {
          if (!Number.isFinite(radius) || radius <= 0) return;
          // Fuzzy P10/P90 bands are an *uncertainty halo*, not an
          // additional damage threshold. Suppress the outline (so
          // they don't read as "another ring") and dim the body
          // alpha further so they live as quiet whispers around the
          // deterministic ring.
          viewer.entities.add({
            id: `${FUZZY_RING_ID_PREFIX}${idx.toString()}-${suffix}`,
            position: centerCartesian,
            ellipse: {
              semiMajorAxis: clampToGreatCircle(radius),
              semiMinorAxis: clampToGreatCircle(radius),
              material: radialDamageMaterial(color, alpha * 0.18),
              outline: false,
              height: 0,
            },
          });
        };
        drawBand('p10', spec.p10, spec.color, 0.4);
        drawBand('p90', spec.p90, spec.color, 0.4);
      });
    }

    // --- Unified camera auto-framing -------------------------------
    // Pull the camera back so EVERY overlay (damage rings, isochrones,
    // ashfall plume, EMP footprint) fits in frame. The frame radius
    // is the max ground-range the scenario reaches; BoundingSphere +
    // flyToBoundingSphere then pick a correct altitude for Cesium's
    // default FOV, regardless of event type or scale.
    const frameRadius = Math.min(
      computeFrameRadius(result, ashfall, isochroneReach),
      EARTH_GREAT_CIRCLE_MAX
    );
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startCascade = (): void => {
      if (ringSpecs.length === 0) return;
      cancelRingAnimationRef.current = animateRingsImperatively(ringSpecs);

      // Wavefront indicator — a single thin bright outline ring
      // that grows at constant linear speed from the burst centre
      // out to the largest damage threshold. Acts as the
      // unmistakeable "you are watching a shock wave move
      // outward" cue: even if the per-band ring growth feels
      // subtle (e.g. closely-spaced thresholds), the user always
      // sees ONE moving wavefront. The ring is purely visual and
      // does NOT correspond to any single physics threshold.
      const cascadeMaxRadiusM = ringSpecs.reduce((m, s) => Math.max(m, s.finalSemiMajor), 0);
      if (cascadeMaxRadiusM > 0) {
        const cascadeT0 = performance.now();
        const cascadeDurationMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 1_800
          : 5_000;
        const wavefrontFadeMs = 800;
        // CRITICAL: do NOT use a single `CallbackProperty` for both
        // semi-major and semi-minor axes. Cesium reads each property
        // independently during a frame and a callback that derives
        // its value from `performance.now()` returns a slightly
        // larger value on the second call — `semiMinorAxis` ends up
        // greater than `semiMajorAxis`, the EllipseGeometry invariant
        // check throws, and rendering stops dead. The original
        // `ringAnimation.ts` header documents this exact failure mode
        // and is the reason the cascade animator uses direct property
        // mutation instead. Use the same approach here.
        const wavefrontEntity = viewer.entities.add({
          id: WAVEFRONT_INDICATOR_ID,
          position: centerCartesian,
          ellipse: {
            semiMajorAxis: 0,
            semiMinorAxis: 0,
            // No fill — the wavefront is a propagating EDGE, not a
            // filled disc. Cesium's outline renders as a ground
            // polyline, always visible regardless of camera pitch.
            fill: false,
            outline: true,
            outlineColor: Color.fromCssColorString('#facc15').withAlpha(0.95),
            outlineWidth: 6,
            height: 0,
          },
        });
        // Stand-alone rAF loop for the wavefront — runs alongside the
        // ring cascade's loop but writes to its own entity. Both axes
        // mutated in the same synchronous statement so Cesium never
        // sees a frame where minor > major. Outline alpha mutated
        // straight on the property too, no `CallbackProperty` round-
        // trip required for the colour either.
        const wavefrontGoldA = Color.fromCssColorString('#facc15');
        const wavefrontGoldB = Color.fromCssColorString('#facc15');
        wavefrontGoldA.alpha = 0.95;
        let wavefrontHandle = 0;
        let wavefrontCancelled = false;
        const wavefrontTick = (): void => {
          if (wavefrontCancelled) return;
          const ellipse = wavefrontEntity.ellipse;
          if (!ellipse) return;
          const elapsed = performance.now() - cascadeT0;
          const t = Math.min(elapsed / cascadeDurationMs, 1);
          // Linear (not eased) growth so the ring appears to move at
          // constant speed — the canonical "shock front travelling"
          // percept.
          const r = cascadeMaxRadiusM * t;
          (ellipse as unknown as { semiMajorAxis: number; semiMinorAxis: number }).semiMajorAxis =
            r;
          (ellipse as unknown as { semiMajorAxis: number; semiMinorAxis: number }).semiMinorAxis =
            r;
          if (elapsed >= cascadeDurationMs) {
            const fadeT = Math.min((elapsed - cascadeDurationMs) / wavefrontFadeMs, 1);
            wavefrontGoldB.red = wavefrontGoldA.red;
            wavefrontGoldB.green = wavefrontGoldA.green;
            wavefrontGoldB.blue = wavefrontGoldA.blue;
            wavefrontGoldB.alpha = 0.95 * (1 - fadeT);
            (ellipse as unknown as { outlineColor: Color }).outlineColor = wavefrontGoldB;
          }
          if (elapsed < cascadeDurationMs + wavefrontFadeMs) {
            wavefrontHandle = requestAnimationFrame(wavefrontTick);
          } else if (!viewer.isDestroyed()) {
            // Self-remove once the fade-out completes.
            viewer.entities.remove(wavefrontEntity);
          }
        };
        wavefrontHandle = requestAnimationFrame(wavefrontTick);
        cancelWavefrontRef.current = (): void => {
          wavefrontCancelled = true;
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(wavefrontHandle);
          }
          if (!viewer.isDestroyed()) {
            const stale = viewer.entities.getById(WAVEFRONT_INDICATOR_ID);
            if (stale) viewer.entities.remove(stale);
          }
        };
      }

      // Mushroom-cloud / fireball VFX (impacts + explosions only).
      // Synchronised with the ring cascade so the user sees the flash
      // bloom alongside the thermal ring's reveal — same beat.
      if (result.type === 'impact') {
        cancelExplosionVfxRef.current = spawnExplosionVfxFromJoules({
          viewer,
          latitude: location.latitude,
          longitude: location.longitude,
          energyJoules: result.data.impactor.kineticEnergy,
        });
      } else if (result.type === 'explosion') {
        cancelExplosionVfxRef.current = spawnExplosionVfxFromJoules({
          viewer,
          latitude: location.latitude,
          longitude: location.longitude,
          energyJoules: result.data.yield.joules,
        });
      }
    };
    if (frameRadius > 0) {
      const padded = Math.max(frameRadius * 1.2, 50_000);
      // Camera pitch: pure top-down (−90°) for ground-pattern events
      // (earthquake, volcano, landslide) where the rings are the
      // entire story. For impact and explosion the mushroom cloud is
      // the visual hero and a strictly top-down view collapses the
      // cloud onto a single pixel column on the camera axis; tilt
      // 30° off-vertical so the user sees the cloud's profile against
      // the OSM imagery while the rings stay essentially circular
      // (1 − cos 30° ≈ 13 % foreshortening, well within the visual
      // budget for "this still looks like an aerial map").
      const isCloudEvent = result.type === 'impact' || result.type === 'explosion';
      const cameraPitchRad = isCloudEvent ? -Math.PI / 3 : -Math.PI / 2;
      viewer.camera.flyToBoundingSphere(new BoundingSphere(centerCartesian, padded), {
        duration: reduceMotion ? 0 : 0.6,
        offset: new HeadingPitchRange(0, cameraPitchRad, padded * 2.5),
        complete: startCascade,
      });
    } else {
      // No camera fly required (e.g. landslide scenarios with no
      // surface ring) — kick the cascade off immediately so the
      // tsunami cavity still gets its expansion animation.
      startCascade();
    }
  }, [location, result, bathymetricTsunami, monteCarlo]);

  // --- Aftershock click-through detail rings ---------------------------
  // When the user clicks an aftershock dot, paint three dim MMI V/VI/VII
  // contours around its offset position. We compute radii on demand via
  // the same Joyner–Boore + Worden 2012 chain used for the mainshock —
  // see `aftershockShakingFootprint` in
  // src/physics/events/earthquake/aftershocks.ts. The detail rings are
  // *non-cascading* (they pop in at full size) because they answer a
  // direct user question ("what's the reach of this aftershock?")
  // rather than dramatising a wavefront — adding the cascade animation
  // would just delay the answer for no pedagogical gain.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Tear down any pre-existing detail rings (covers re-pin onto a
    // different aftershock and dismissal alike).
    AFTERSHOCK_DETAIL_IDS.forEach((id) => {
      const e = viewer.entities.getById(id);
      if (e) viewer.entities.remove(e);
    });

    if (selectedAftershockIndex === null || result?.type !== 'earthquake' || location === null) {
      return;
    }

    const event = result.data.aftershocks.events[selectedAftershockIndex];
    if (event === undefined) return;

    const footprint = aftershockShakingFootprint(event.magnitude);
    const latRad = (location.latitude * Math.PI) / 180;
    const cosLat = Math.max(Math.cos(latRad), 1e-6);
    const dlat = (event.northOffsetM as number) / 111_000;
    const dlon = (event.eastOffsetM as number) / (111_000 * cosLat);
    const center = Cartesian3.fromDegrees(location.longitude + dlon, location.latitude + dlat);

    const contours: { id: string; radius: number; color: Color; alpha: number }[] = [
      // The MMI ramp goes "lightest contour at the largest radius" so
      // the eye reads outward → safer, mirroring how the mainshock
      // mmi7/8/9 rings are painted.
      {
        id: AFTERSHOCK_DETAIL_IDS[0],
        radius: footprint.mmi5Radius,
        color: MMI_RING_COLORS.mmi7,
        alpha: 0.25,
      },
      {
        id: AFTERSHOCK_DETAIL_IDS[1],
        radius: footprint.mmi6Radius,
        color: MMI_RING_COLORS.mmi8,
        alpha: 0.35,
      },
      {
        id: AFTERSHOCK_DETAIL_IDS[2],
        radius: footprint.mmi7Radius,
        color: MMI_RING_COLORS.mmi9,
        alpha: 0.45,
      },
    ];

    contours.forEach(({ id, radius, color, alpha }) => {
      if (!Number.isFinite(radius) || radius <= 0) return;
      viewer.entities.add({
        id,
        position: center,
        ellipse: {
          semiMajorAxis: clampToGreatCircle(radius),
          semiMinorAxis: clampToGreatCircle(radius),
          material: radialDamageMaterial(color, alpha),
          outline: true,
          outlineColor: color.withAlpha(0.55),
          height: 0,
        },
      });
    });

    return (): void => {
      if (viewer.isDestroyed()) return;
      AFTERSHOCK_DETAIL_IDS.forEach((id) => {
        const e = viewer.entities.getById(id);
        if (e) viewer.entities.remove(e);
      });
    };
  }, [selectedAftershockIndex, result, location]);

  return (
    <>
      <div ref={containerRef} className={styles.container} data-testid="globe-viewer" />
      <RingTooltip ref={tooltipElRef} info={hoverInfo} />
      <AftershockDetailCard />
    </>
  );
}

/**
 * Collect the widest ground-range reach across every overlay the
 * scene is about to render, so the camera frame encloses them all.
 *
 * Per event type:
 *   - impact: damage.overpressure1psi, firestorm sustain, ejecta 1 m
 *     edge, impact-tsunami cavity (when oceanic).
 *   - explosion: 1 psi ring, thermal 3°, firestorm sustain, EMP
 *     affected radius (dominates for HEMP exoatmospheric bursts like
 *     Starfish Prime — ~2 300 km).
 *   - earthquake: rupture length / 2, MMI VII contour, liquefaction
 *     radius (the last dominates for megathrusts like Tōhoku).
 *   - volcano: pyroclastic runout, ashfall plume downwind extent.
 *   - bathymetric tsunami isochrones (via `isochroneReach` argument).
 *
 * Returns 0 when nothing can be framed (e.g. before evaluate).
 */
/**
 * Choose up to two representative MC metrics whose P10/P90 percentiles
 * are worth painting as fuzzy uncertainty bands on the globe. Each
 * spec carries the radius pair (m) and the colour to use; the colour
 * matches the nominal-result ring of the same physical quantity so
 * the eye reads "halo around the deterministic ring" rather than
 * "extra rings to memorise".
 *
 * Why two and not all of them: rendering P10/P90 for every metric
 * blows past visual budget — four impact metrics × two percentiles
 * = eight extra rings on a busy globe. We pick the metric the user
 * most often asks "how confident are we about this?" about.
 */
function pickFuzzyMetrics(mc: ActiveMonteCarlo): { p10: number; p90: number; color: Color }[] {
  switch (mc.type) {
    case 'impact':
      return [
        {
          p10: mc.data.metrics.finalCraterDiameter.p10 / 2,
          p90: mc.data.metrics.finalCraterDiameter.p90 / 2,
          color: RING_COLORS.craterRim,
        },
        {
          p10: mc.data.metrics.firestormIgnition.p10,
          p90: mc.data.metrics.firestormIgnition.p90,
          color: RING_COLORS.thirdDegreeBurn,
        },
      ];
    case 'explosion':
      return [
        {
          p10: mc.data.metrics.fivePsiRadius.p10,
          p90: mc.data.metrics.fivePsiRadius.p90,
          color: RING_COLORS.overpressure5psi,
        },
        {
          p10: mc.data.metrics.onePsiRadius.p10,
          p90: mc.data.metrics.onePsiRadius.p90,
          color: RING_COLORS.overpressure1psi,
        },
      ];
    case 'earthquake':
      return [
        {
          p10: mc.data.metrics.mmi8Radius.p10,
          p90: mc.data.metrics.mmi8Radius.p90,
          color: MMI_RING_COLORS.mmi8,
        },
        {
          p10: mc.data.metrics.liquefactionRadius.p10,
          p90: mc.data.metrics.liquefactionRadius.p90,
          color: MMI_RING_COLORS.mmi7,
        },
      ];
    case 'volcano':
      return [
        {
          p10: mc.data.metrics.pyroclasticRunout.p10,
          p90: mc.data.metrics.pyroclasticRunout.p90,
          color: PYROCLASTIC_RING_COLOR,
        },
      ];
  }
}

function computeFrameRadius(
  result: ActiveResult,
  ashfall: WindAdvectedAshfall | undefined,
  isochroneReach: number
): number {
  let r = 0;
  const bump = (v: number | undefined): void => {
    if (typeof v === 'number' && Number.isFinite(v) && v > r) r = v;
  };
  if (result.type === 'impact') {
    bump(result.data.damage.overpressure1psi);
    bump(result.data.firestorm.sustainRadius);
    bump(result.data.ejecta.blanketEdge1m);
    // The asymmetric blanket extends past blanketEdge1mm by the
    // downrange-offset + the stretched semi-major axis; account for
    // that explicitly so a low-angle impact frames its butterfly tail.
    const f = result.data.ejecta.asymmetryFactor;
    bump(
      (result.data.ejecta.blanketEdge1mm as number) * (1 + 0.4 * f) +
        (result.data.ejecta.downrangeOffset as number)
    );
    if (result.data.tsunami) bump(result.data.tsunami.cavityRadius);
  } else if (result.type === 'explosion') {
    bump(result.data.blast.overpressure1psiRadiusHob);
    bump(result.data.thermal.thirdDegreeBurnRadius);
    bump(result.data.firestorm.sustainRadius);
    if (result.data.emp.regime !== 'NEGLIGIBLE') bump(result.data.emp.affectedRadius);
    bump(result.data.crater.apparentDiameter / 2);
    if (result.data.tsunami) bump(result.data.tsunami.cavityRadius);
  } else if (result.type === 'earthquake') {
    bump(result.data.ruptureLength / 2);
    bump(result.data.shaking.mmi7Radius);
    bump(result.data.shaking.liquefactionRadius);
  } else if (result.type === 'volcano') {
    bump(result.data.pyroclasticRunout);
    bump(result.data.pyroclasticRunoutEnergyLine);
    if (ashfall !== undefined) bump(ashfall.downwindRange);
    if (result.data.lateralBlast !== undefined) bump(result.data.lateralBlast.runout);
    if (result.data.tsunami !== undefined) bump(result.data.tsunami.cavityRadius);
  } else {
    // landslide — only the tsunami cavity is renderable.
    if (result.data.tsunami !== null) bump(result.data.tsunami.cavityRadius);
  }
  if (isochroneReach > r) r = isochroneReach;
  return r;
}

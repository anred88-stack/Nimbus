import { Color, ConstantProperty, Event, Material, type Property } from 'cesium';

/**
 * Custom Cesium Fabric material used for every puff in the
 * mushroom-cloud VFX.
 *
 * Design problem: `ColorMaterialProperty` paints an ellipsoid with a
 * single flat colour, which makes a cluster of ellipsoids read as
 * "stack of geometric balls" rather than "cumulus cloud". Adding more
 * ellipsoids does not fix this — the outline of every ball is still
 * a hard mathematical curve. Real clouds have soft alpha-falloff at
 * their silhouette and a subtle vertical lighting gradient (sunlight
 * from above, shadow at the base).
 *
 * This Fabric shader fakes both effects on the surface of a regular
 * `EllipsoidGraphics`:
 *
 * 1. **Silhouette fade (Fresnel)**. The fragment shader reads the
 *    eye-coordinate normal `materialInput.normalEC` and uses
 *    `abs(normalEC.z)` — the dot product of the surface normal and
 *    the camera-forward direction in eye space — as a "facing"
 *    factor. Front-facing fragments (facing ≈ 1) stay opaque; the
 *    silhouette ring (facing ≈ 0) fades to alpha 0. The result is
 *    a soft halo edge instead of a hard curve.
 *
 * 2. **Vertical lighting**. `normalEC.y` is +1 at the top of the
 *    sphere as projected on screen, −1 at the bottom. We mix the
 *    base colour between a darker shadow value (0.55× tint) at the
 *    bottom and a brighter lit value (1.15× tint) at the top. Under
 *    the simulator's −60° camera pitch, eye-space +Y aligns with
 *    "up in the sky" closely enough that this approximation reads
 *    correctly without having to carry the puff's local up
 *    direction as a uniform.
 *
 * The Fabric `type` is registered exactly once at module load via a
 * side-effect `Material` construction; subsequent instances reuse
 * the cached, compiled shader. {@link CloudMaterialProperty} is the
 * per-entity wrapper expected by `entity.ellipsoid.material`.
 *
 * Pure visual layer — no scientific output is altered. The puff's
 * geometric size, position and lifetime are all controlled by the
 * `CallbackProperty` chain in `explosionVfx.ts` and remain fixed.
 */

const FABRIC_TYPE = 'CloudPuff';

/**
 * Fragment shader.
 *
 * Toggle DEBUG_FORCE_RED at the top of the shader to switch the
 * material to opaque red. If the puffs render red after toggling,
 * the Fabric definition is wired to the entity correctly and the
 * issue is in the `lightness` / `edgeAlpha` math below. If they
 * stay invisible / unchanged, the Fabric is not being applied and
 * the bug is in the registration flow (`ensureFabricRegistered` /
 * the `material` accessor on `EllipsoidGraphics`).
 *
 * The `materialInput.normalEC` field carries the surface normal in
 * eye coordinates; for `EllipsoidGeometry` the `VertexFormat.DEFAULT`
 * Cesium uses generates per-vertex normals automatically, so this
 * read is safe. As a fallback (zero / undefined normal), we clamp
 * the alpha so the puff never disappears entirely.
 */
const FABRIC_SOURCE = `
#define DEBUG_FORCE_RED 0

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

#if DEBUG_FORCE_RED
  material.diffuse = vec3(1.0, 0.0, 0.0);
  material.alpha = 1.0;
  return material;
#endif

  vec3 nEC = normalize(materialInput.normalEC);
  // Guard against degenerate normals (zero-length input). When that
  // happens the normalize() above produces NaN; treat it as
  // "front-facing" so the puff still draws.
  bvec3 nanCheck = bvec3(nEC.x != nEC.x, nEC.y != nEC.y, nEC.z != nEC.z);
  if (any(nanCheck)) {
    nEC = vec3(0.0, 0.0, 1.0);
  }

  // Fresnel-style silhouette fade. abs() instead of plain dot lets
  // both the front and the back of the sphere stay visible — for a
  // translucent cloud this reads "you can see through it" rather
  // than "it's only half here". The smoothstep band is wide so the
  // fade is gentle (clouds don't have hard edges).
  float facing = abs(nEC.z);
  float edgeAlpha = smoothstep(0.05, 0.55, facing);

  // Vertical lighting. nEC.y ∈ [-1, 1]; map to [0, 1] then mix
  // shadow → lit. Under the simulator's oblique camera (−π/3 pitch)
  // eye-space +Y aligns within a few degrees of world up, so this
  // approximation puts the lit highlight on top of the puff
  // regardless of which direction the user is facing.
  float upFactor = nEC.y * 0.5 + 0.5;
  float lightness = mix(0.55, 1.15, upFactor);

  vec3 tint = color.rgb * lightness;
  // Soft body brightness — clouds are slightly self-illuminated by
  // multiple-scattered sunlight, so we hold the diffuse channel
  // even at the silhouette and only fade the alpha. The result is
  // a glowing-from-within look at the rim instead of a darkening
  // halo, which is what real puffs do under high-altitude lighting.
  // We also floor the alpha at a small value so a 100 %-side-on
  // puff never vanishes if the camera catches it edge-on.
  material.diffuse = tint;
  material.alpha = clamp(color.a * max(edgeAlpha, 0.05), 0.0, 1.0);
  return material;
}
`;

let fabricRegistered = false;

function ensureFabricRegistered(): void {
  if (fabricRegistered) return;
  // Side-effect: compile and cache the Fabric definition under
  // FABRIC_TYPE. The constructed Material is intentionally
  // discarded — we only care about the cache side-effect, which
  // compiles and caches the GLSL on first render.
  const _registrationProbe = new Material({
    fabric: {
      type: FABRIC_TYPE,
      uniforms: { color: new Color(1, 1, 1, 1) },
      source: FABRIC_SOURCE,
    },
    translucent: true,
  });
  void _registrationProbe;
  fabricRegistered = true;
}

/**
 * Per-entity `MaterialProperty`-shaped wrapper. Cesium duck-types
 * the material accessor on entity primitives: any object exposing
 * `definitionChanged`, `isConstant`, `getType`, `getValue`, and
 * `equals` is accepted.
 *
 * Accepts either a static {@link Color} or a Cesium `Property` that
 * resolves to a Color at each frame. When given a Property (e.g. a
 * `CallbackProperty<Color>` driven by a fade-out timer) the whole
 * material becomes time-varying — `isConstant` mirrors the property's
 * own constancy. This is the API the mushroom-cloud VFX uses to fade
 * each puff alpha out over its tail time.
 */
export class CloudMaterialProperty {
  public readonly definitionChanged: Event = new Event();

  private readonly _colorProperty: Property;
  /** Mirror of the wrapped property's constancy. Used by Cesium to
   *  decide whether it can pre-bake the material values per entity
   *  versus re-evaluate every frame. */
  public readonly isConstant: boolean;

  constructor(color: Color | Property) {
    ensureFabricRegistered();
    this._colorProperty = color instanceof Color ? new ConstantProperty(Color.clone(color)) : color;
    // ConstantProperty.isConstant is `true`; CallbackProperty exposes
    // the constancy chosen at construction. Either way we can pass
    // the value straight through.
    this.isConstant = (this._colorProperty as { isConstant: boolean }).isConstant;
  }

  getType(): string {
    return FABRIC_TYPE;
  }

  getValue(time?: unknown, result?: { color?: Color }): { color: Color } {
    const target = result ?? {};
    const provider = this._colorProperty as {
      getValue: (t?: unknown, r?: Color) => Color;
    };
    target.color = provider.getValue(time, target.color);
    return target as { color: Color };
  }

  equals(other?: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof CloudMaterialProperty)) return false;
    // Object identity is enough — every puff in the VFX gets a
    // freshly-constructed property, so two CloudMaterialProperty
    // instances are equal iff they share the same wrapped property.
    return this._colorProperty === other._colorProperty;
  }
}

/**
 * Convenience factory: builds a {@link CloudMaterialProperty} with
 * the supplied tint and alpha. Mirrors the API of
 * {@link radialDamageMaterial} so the two materials are
 * interchangeable from the caller's point of view.
 */
export function cloudMaterial(color: Color, alpha = 1.0): CloudMaterialProperty {
  return new CloudMaterialProperty(color.withAlpha(alpha));
}

/**
 * Build a {@link CloudMaterialProperty} backed by a time-varying
 * color provider. Use this when the puff alpha (or hue) needs to
 * change frame-by-frame — e.g. fading the cloud out over its
 * dissolution tail. The provider should return a fresh `Color` on
 * each call; `CallbackProperty<Color>` is the canonical wrapper.
 */
export function cloudMaterialFromProperty(colorProperty: Property): CloudMaterialProperty {
  return new CloudMaterialProperty(colorProperty);
}

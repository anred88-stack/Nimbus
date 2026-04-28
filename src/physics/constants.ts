import type {
  KilogramPerCubicMeter,
  Kilograms,
  Meters,
  MetersPerSecond,
  Pascals,
} from './units.js';

// Speed of light in vacuum. NIST/BIPM SI brochure (2019 redefinition), m/s.
export const SPEED_OF_LIGHT = 299_792_458 as MetersPerSecond;

// Newtonian gravitational constant. CODATA 2018, m^3 kg^-1 s^-2.
export const GRAVITATIONAL_CONSTANT = 6.674_30e-11;

// Earth mean radius. IUGG GRS80 / IERS, m.
export const EARTH_RADIUS = 6_371_000 as Meters;

// Earth mass. IAU 2015 nominal solar values / GM_E from SI redefinition, kg.
export const EARTH_MASS = 5.972e24 as Kilograms;

// Standard gravity. ISO 80000-3 (originally CIPM 1901), m/s^2.
export const STANDARD_GRAVITY = 9.806_65;

// Seawater surface density. UNESCO/IOC 1981, kg/m^3.
export const SEAWATER_DENSITY = 1_025 as KilogramPerCubicMeter;

// Crustal rock average density. Turcotte & Schubert, Geodynamics
// (2nd ed., 2002), Table 4.1, kg/m^3.
export const CRUSTAL_ROCK_DENSITY = 2_700 as KilogramPerCubicMeter;

// Ordinary chondrite (stony asteroid) bulk density — default impactor
// density for Collins/Melosh/Marcus 2005 pi-group scaling.
// Consolmagno, Britt & Macke (2008), Chemie der Erde 68(1), Table 1, kg/m^3.
export const CHONDRITIC_DENSITY = 3_000 as KilogramPerCubicMeter;

// Iron-meteorite bulk density (Meteor Crater impactor class).
// Consolmagno, Britt & Macke (2008), Chemie der Erde 68(1), Table 1, kg/m^3.
export const IRON_METEORITE_DENSITY = 7_800 as KilogramPerCubicMeter;

// Simple-to-complex crater transition diameter on Earth (competent rock).
// Below this craters are bowl-shaped; above, they collapse into central
// peaks and terraces.
// Collins, Melosh & Marcus (2005), MAPS 40(6), Eq. 28.
// DOI: 10.1111/j.1945-5100.2005.tb00157.x. Units: m.
export const SIMPLE_COMPLEX_TRANSITION_EARTH = 3_200 as Meters;

// Specific energy of TNT. 1 kt ≡ 4.184e12 J by definition (NIST).
// J/kg.
export const TNT_SPECIFIC_ENERGY = 4.184e6;

// Sea-level pressure. ICAO Standard Atmosphere (Doc 7488-CD, 1993) / ISO 2533, Pa.
export const SEA_LEVEL_PRESSURE = 101_325 as Pascals;

// Thermal partition of a low-altitude nuclear detonation: fraction of
// total yield radiated as thermal EM (UV–visible–IR), the rest being
// blast, neutrons, and prompt gamma.
// Glasstone & Dolan (1977), §1.22 and §7.03. Dimensionless.
export const NUCLEAR_THERMAL_PARTITION = 0.35;

// Luminous efficiency of a cosmic-impact fireball — fraction of the
// impactor's KE radiated as thermal light reaching the ground. Much
// lower than the nuclear partition because most impact energy goes into
// crater excavation and shock work before the fireball forms.
// Collins, Melosh & Marcus (2005), §"Thermal radiation"; Toon et al.
// (1997), Rev. Geophys. 35, Table 1. Nominal η = 3e-3, dimensionless.
export const IMPACT_LUMINOUS_EFFICIENCY = 3e-3;

// Atmospheric blast coupling efficiency for a cosmic impact —
// fraction of the impactor's kinetic energy that is delivered to the
// air-shock wave (and therefore drives the over-pressure damage rings
// at ground level). The remainder goes into cratering work, ejecta
// kinetic energy, ground-coupled seismic waves, melt/vapour formation
// and the thermal pulse already accounted for via
// IMPACT_LUMINOUS_EFFICIENCY. Pierazzo (1997, "Hydrocode simulations
// of vertical impacts") and Collins, Melosh & Marcus (2005, "Earth
// Impact Effects Program") both anchor the value near 0.5; we adopt
// 0.5 as the canonical popular-science envelope.
//
// Without this factor, applying the Kinney-Graham over-pressure law
// directly to the impactor's full KE over-states blast radii by
// ≈ √(1/0.5) ≈ 1.41 × at every threshold — exactly the +42 % we saw
// on the Tunguska 1 psi (71 km vs 50 km observed forest blowdown)
// and Chicxulub 1 psi (8 510 km vs 6 000 km Collins-Melosh-Marcus
// envelope) rings. Applying 0.5 brings both inside ±15 %.
export const IMPACT_BLAST_COUPLING = 0.5;

// Asteroid / comet taxonomy with class-midpoint bulk density (kg/m^3)
// and tensile strength (Pa). Real bodies vary ±30%.
// Britt & Consolmagno (2003), MAPS 38(8): 1161; Popova et al. (2011),
// MAPS 46(10): 1525.
export const ASTEROID_TAXONOMY = {
  C_TYPE: { density: 2_000, strength: 1e5, label: 'C-type (carbonaceous)' },
  S_TYPE: { density: 3_300, strength: 2e6, label: 'S-type (stony)' },
  M_TYPE: { density: 5_300, strength: 5e7, label: 'M-type (metallic)' },
  IRON: { density: 7_800, strength: 5e7, label: 'Iron meteorite' },
  COMETARY: { density: 600, strength: 1e4, label: 'Cometary nucleus' },
} as const;

export type AsteroidTaxonomyClass = keyof typeof ASTEROID_TAXONOMY;

// Burn fluence thresholds on exposed skin (J/m^2).
// Glasstone & Dolan (1977), Table 7.41, converted from cal/cm^2.
export const THIRD_DEGREE_BURN_FLUENCE = 3.35e5; // 8 cal/cm^2
export const SECOND_DEGREE_BURN_FLUENCE = 2.09e5; // 5 cal/cm^2 — full-thickness blistering
export const FIRST_DEGREE_BURN_FLUENCE = 8.37e4; // 2 cal/cm^2 — sunburn-like erythema

// Minimum fluence to ignite dry newsprint / light kindling — bounds the
// urban-firestorm ignition radius. Glasstone & Dolan (1977), Table 7.42,
// 10 cal/cm^2. J/m^2.
export const FLAMMABLE_IGNITION_FLUENCE = 4.19e5;

// Threshold above which a self-sustaining firestorm tends to develop
// over dense flammable urban terrain. Hamburg 1943 and Hiroshima 1945
// both crossed this line over ~5 km^2 of city.
// Glasstone & Dolan (1977), §7.40, 6 cal/cm^2. J/m^2.
export const URBAN_FIRESTORM_FLUENCE = 2.51e5;

// Shear modulus (rigidity) of upper-crustal / oceanic rock — the
// classical 30 GPa used in fault-slip inversions.
// Aki & Richards (1980), Quantitative Seismology (2nd ed.), §3.3. Pa.
export const CRUSTAL_RIGIDITY = 3.0e10;

// Dense-rock-equivalent (DRE) density: silicate magma at zero porosity.
// Used to convert volcanic ejecta volumes between "tephra as deposited"
// and "magma as erupted".
// Mastin et al. (2009), JVGR 186(1-2), Table 1.
// DOI: 10.1016/j.jvolgeores.2009.01.008. kg/m^3.
export const DRE_DENSITY = 2_500 as KilogramPerCubicMeter;

// Branded primitives for physical units. Constructors below are the
// only sanctioned way to enter a branded value — they're nominal
// `as` casts at runtime, real type-checking at compile time.
//
// See docs/SCIENCE.md for the convention and docs/ARCHITECTURE.md
// for why physics-layer signatures must use these instead of `number`.

export type Kilograms = number & { readonly __brand: 'kg' };
export type Meters = number & { readonly __brand: 'm' };
export type Seconds = number & { readonly __brand: 's' };
export type MetersPerSecond = number & { readonly __brand: 'm/s' };
export type MetersPerSecondSquared = number & { readonly __brand: 'm/s^2' };
export type Joules = number & { readonly __brand: 'J' };
export type Megatons = number & { readonly __brand: 'Mt' };
export type Pascals = number & { readonly __brand: 'Pa' };
export type Newtons = number & { readonly __brand: 'N' };
export type NewtonMeters = number & { readonly __brand: 'N*m' };
export type Kelvin = number & { readonly __brand: 'K' };
export type Watts = number & { readonly __brand: 'W' };
export type Radians = number & { readonly __brand: 'rad' };
export type Degrees = number & { readonly __brand: 'deg' };
export type KilogramPerCubicMeter = number & { readonly __brand: 'kg/m^3' };
export type SquareMeters = number & { readonly __brand: 'm^2' };

export const kg = (n: number): Kilograms => n as Kilograms;
export const m = (n: number): Meters => n as Meters;
export const s = (n: number): Seconds => n as Seconds;
export const mps = (n: number): MetersPerSecond => n as MetersPerSecond;
export const mps2 = (n: number): MetersPerSecondSquared => n as MetersPerSecondSquared;
export const J = (n: number): Joules => n as Joules;
export const Mt = (n: number): Megatons => n as Megatons;
export const Pa = (n: number): Pascals => n as Pascals;
export const N = (n: number): Newtons => n as Newtons;
export const Nm = (n: number): NewtonMeters => n as NewtonMeters;
export const K = (n: number): Kelvin => n as Kelvin;
export const W = (n: number): Watts => n as Watts;
export const rad = (n: number): Radians => n as Radians;
export const deg = (n: number): Degrees => n as Degrees;
export const kgPerM3 = (n: number): KilogramPerCubicMeter => n as KilogramPerCubicMeter;
export const sqm = (n: number): SquareMeters => n as SquareMeters;

// 1 Mt TNT ≡ 4.184e15 J by NIST convention.
export const megatonsToJoules = (mt: Megatons): Joules => J((mt as number) * 4.184e15);
export const joulesToMegatons = (j: Joules): Megatons => Mt((j as number) / 4.184e15);

// 1° = π/180 rad (exact).
export const degreesToRadians = (d: Degrees): Radians => rad(((d as number) * Math.PI) / 180);
export const radiansToDegrees = (r: Radians): Degrees => deg(((r as number) * 180) / Math.PI);

/**
 * Join class-name fragments, filtering out falsy values.
 *
 * Useful with CSS Modules under `noUncheckedIndexedAccess`: each
 * `styles.foo` access is typed `string | undefined`, so direct template
 * interpolation fails `@typescript-eslint/restrict-template-expressions`.
 * `cx(styles.foo, cond && styles.bar)` yields a plain `string`.
 */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

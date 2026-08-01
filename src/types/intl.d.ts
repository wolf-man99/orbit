/**
 * `Intl.NumberFormat.prototype.format` accepts a string.
 *
 * This is ES2023 (the "Intl.NumberFormat V3" proposal) and is implemented in
 * every runtime Orbit targets, but TypeScript's bundled libs still type the
 * parameter as `number | bigint` only — verified against lib.es5.d.ts in the
 * pinned compiler.
 *
 * The overload matters rather than being a convenience: passing an exact
 * decimal STRING is how a monetary value reaches the formatter without ever
 * being converted to a double. Formatting the number 9007199254740993 yields
 * …992; formatting the string yields …993. Casting to `number` at each call
 * site would type-check and silently reintroduce exactly the precision loss
 * the money model exists to prevent.
 *
 * Remove when TypeScript ships the overload.
 */
declare namespace Intl {
  interface NumberFormat {
    format(value: string): string
  }
}

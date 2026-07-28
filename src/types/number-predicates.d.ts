/**
 * The ECMAScript runtime accepts any value for Number.isSafeInteger and returns
 * true only for safe integer numbers. Model that behavior as a type predicate
 * so validated optional JSON fields remain narrowed after fail-closed guards.
 */
interface NumberConstructor {
  isSafeInteger(value: unknown): value is number;
}

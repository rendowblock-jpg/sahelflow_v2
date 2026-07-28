export {};

declare global {
  interface NumberConstructor {
    /**
     * ECMAScript returns true only for values whose runtime type is number and
     * whose value is a safe integer. Model that contract as a type predicate so
     * validated unknown or optional inputs remain narrowed after the guard.
     */
    isSafeInteger(number: unknown): number is number;
  }
}

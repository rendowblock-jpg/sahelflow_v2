/**
 * Client navigation to any other dashboard route closes an open modal: a slot
 * that no longer matches keeps its last content visible, so every other route
 * resolves the `@modal` slot to this empty page instead.
 */
export default function ModalCatchAll() {
  return null;
}

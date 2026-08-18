import "server-only";

export type SearchProjectionModel =
  | "Customer"
  | "Product"
  | "Order"
  | "Delivery"
  | "Return";

export interface SearchProjectionMutation {
  shopId: string;
  model: SearchProjectionModel;
}

type SearchProjectionListener = (event: SearchProjectionMutation) => void;

const SEARCH_PROJECTION_MODELS = new Set<SearchProjectionModel>([
  "Customer",
  "Product",
  "Order",
  "Delivery",
  "Return",
]);

const globalProjectionEvents = globalThis as unknown as {
  sahelflowSearchProjectionListeners?: Set<SearchProjectionListener>;
};

function listeners(): Set<SearchProjectionListener> {
  return (globalProjectionEvents.sahelflowSearchProjectionListeners ??= new Set());
}

export function isSearchProjectionModel(
  model: string,
): model is SearchProjectionModel {
  return SEARCH_PROJECTION_MODELS.has(model as SearchProjectionModel);
}

/**
 * Search projections are derived process memory only. Publishing invalidation
 * after a successful canonical write never changes business authority; it only
 * prevents the command center from serving an obsolete derived index.
 */
export function publishSearchProjectionMutation(
  event: SearchProjectionMutation,
): void {
  for (const listener of listeners()) {
    try {
      listener(event);
    } catch {
      // Search freshness must never be allowed to roll back or fail a canonical
      // business mutation. A failed listener causes only a later cache rebuild.
    }
  }
}

export function subscribeSearchProjectionMutations(
  listener: SearchProjectionListener,
): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}

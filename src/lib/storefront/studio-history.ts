export interface StorefrontStudioHistory<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createStorefrontStudioHistory<T>(present: T): StorefrontStudioHistory<T> {
  return { past: [], present, future: [] };
}

export function commitStorefrontStudioHistory<T>(
  history: StorefrontStudioHistory<T>,
  next: T,
  limit = 50,
): StorefrontStudioHistory<T> {
  return {
    past: [...history.past, history.present].slice(-limit),
    present: next,
    future: [],
  };
}

export function undoStorefrontStudioHistory<T>(history: StorefrontStudioHistory<T>): StorefrontStudioHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoStorefrontStudioHistory<T>(history: StorefrontStudioHistory<T>): StorefrontStudioHistory<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

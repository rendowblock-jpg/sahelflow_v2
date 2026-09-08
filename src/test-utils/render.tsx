/**
 * Render-test harness.
 *
 * SahelFlow's UI evidence layer historically asserted SOURCE TEXT
 * (`readFileSync` + `toContain`). That proves a string exists in a file; it
 * cannot prove the component behaves. This harness gives contract tests a real
 * DOM so a row can claim behavior instead of spelling.
 *
 * Usage — put the docblock at the top of the test file so ONLY that file gets a
 * DOM environment (the other ~420 node-environment suites are untouched):
 *
 *   /**
 *    * @vitest-environment happy-dom
 *    *\/
 *   import { render, screen } from "@/test-utils/render";
 *
 * The browser observers below are not implemented by happy-dom. The app uses
 * them for the inbox render window (INB-11), the notification list and the
 * pane resizer, so they are stubbed here rather than in every test file.
 */
// Registers the jest-dom matchers AND their type augmentation on vitest's
// `Assertion` interface. Importing `@testing-library/jest-dom/matchers` and
// calling `expect.extend` works at RUNTIME but declares no types, so
// `toBeInTheDocument`/`toHaveAttribute` fail `tsc --noEmit` — caught by the
// hosted Quality Gate, which is the only full-project type authority here.
import "@testing-library/jest-dom/vitest";

import { act, cleanup, render as rtlRender } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

type ObserverCallback = (entries: unknown[], observer: unknown) => void;

/** Observers registered by the component under test, so a test can fire them. */
const intersectionCallbacks = new Set<ObserverCallback>();

class StubIntersectionObserver {
  constructor(callback: ObserverCallback) {
    intersectionCallbacks.add(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}

class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * Drive every registered IntersectionObserver as if `target` entered the
 * viewport. The inbox render window grows on intersection, so a test that wants
 * to prove window growth calls this instead of faking scroll geometry.
 */
export function triggerIntersection(isIntersecting = true): void {
  // The observed components call setState from inside the observer callback.
  // Firing it outside `act` leaves the update uncommitted, so an assertion on
  // the next line would read the PREVIOUS render and report a false failure.
  act(() => {
    for (const callback of intersectionCallbacks) {
      callback([{ isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }], {
        disconnect() {},
      });
    }
  });
}

function installDomStubs(): void {
  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
  vi.stubGlobal("ResizeObserver", StubResizeObserver);

  // happy-dom implements neither; Radix and the thread scroll anchoring call both.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function scrollTo(): void {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
      return false;
    };
  }
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }));
  }
}

/**
 * The provider subset from `src/app/layout.tsx` that dashboard components
 * legitimately require as context. Rendering without these reproduces context
 * errors that never occur in the app, so a render test would be measuring the
 * harness instead of the component.
 *
 * Kept deliberately minimal: theme/locale/nuqs providers pull server-only
 * modules, and no inbox behavior under test depends on them.
 */
function AppProviders({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={300}>{children}</TooltipProvider>;
}

export function render(ui: ReactElement) {
  installDomStubs();
  return rtlRender(ui, { wrapper: AppProviders });
}

afterEach(() => {
  intersectionCallbacks.clear();
  cleanup();
});

// Explicit re-exports only. A blanket `export *` would also re-export
// @testing-library's own `render`, colliding with (and shadowing) the
// provider-wrapped `render` above — tests would silently mount without the
// app's context and fail for reasons that never occur in production.
export {
  act,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
  cleanup,
  renderHook,
} from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

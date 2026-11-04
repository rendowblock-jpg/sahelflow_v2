"use client";

import { useEffect } from "react";

/**
 * Says "this page has hydrated" for pages that are not the app shell: the public hosted store pages and the 404 page.
 *
 * `html[data-sf-hydrated="true"]` is what the browser checks (e2e, the UI sweep) wait for. The app shell and the sign-in
 * pages set it through `RuntimeUiReadyBeacon`, which also tells the packaged desktop shell that the UI is ready. A
 * public page must not send that desktop signal, so this is the marker only: same attribute, no request.
 *
 * Inside the app shell the 404 page renders under the beacon, which already set the attribute and stays mounted. The
 * marker then leaves it alone, so leaving the 404 page never clears a marker that the still-hydrated shell owns.
 */
export function HydrationMarker() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.sfHydrated === "true") return;
    root.dataset.sfHydrated = "true";
    return () => {
      delete root.dataset.sfHydrated;
    };
  }, []);

  return null;
}

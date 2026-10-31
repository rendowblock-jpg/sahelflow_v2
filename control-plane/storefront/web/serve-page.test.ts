import { describe, expect, it } from "vitest";

import manifest from "./asset-manifest.generated.json";
import { storeAssets } from "./serve-page";

describe("the assets the Worker hands to the hosted page", () => {
  it("carry every file the build produced, including the home page photo-fallback script", () => {
    // The Worker once listed css, js, communes, fonts and skins by hand and forgot `photos`: the home page of a store
    // never got its photo-fallback script in production while every test (which passes its own assets) stayed green.
    expect(storeAssets()).toEqual(manifest);
    expect(storeAssets().photos).toMatch(/^\/_sf\/photos\.[0-9a-f]{10}\.js$/);
  });

  it("follows the manifest it is given, key for key", () => {
    const other = { ...manifest, photos: "/_sf/photos.0000000000.js", extra: "x" };
    expect(storeAssets(other)).toEqual(other);
  });
});

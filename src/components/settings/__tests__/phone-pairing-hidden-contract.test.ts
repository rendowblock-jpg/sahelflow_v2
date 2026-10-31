import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PHONE_PAIRING_AVAILABLE } from "@/lib/connected-platform/pairing-link";

const pages = readFileSync(join(process.cwd(), "src/components/settings/settings-pages.tsx"), "utf8");

describe("the phone pairing card stays hidden until the phone app has a home", () => {
  it("is switched off in code: app.sahelflow.com does not exist and the relay migrations are not applied", () => {
    // Flip this ONLY on the founder's word (host name, PWA_ORIGINS, D1 migrations 0002 + 0003) and change this test with it.
    expect(PHONE_PAIRING_AVAILABLE).toBe(false);
  });

  it("settings renders the card only behind that switch, and only once", () => {
    expect(pages).toMatch(/PHONE_PAIRING_AVAILABLE\s*\?\s*<PhonePairingCard\s*\/>\s*:\s*null/);
    expect(pages.match(/<PhonePairingCard/g)?.length ?? 0).toBe(1);
  });
});

import { describe, expect, it, vi } from "vitest";

import { publishStatusView, saveThenPublish } from "@/components/storefront/studio/publish-flow";

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key);

describe("saveThenPublish: one click, save first", () => {
  it("dirty: saves, then publishes the version the save returned, in that order", async () => {
    const calls: string[] = [];
    const result = await saveThenPublish({
      dirty: true,
      version: "2026-10-31T01:00:00.000Z",
      save: async () => {
        calls.push("save");
        return { ok: true, version: "2026-10-31T01:00:09.000Z" };
      },
      release: async (version) => {
        calls.push(`release:${version}`);
        return "rel_9";
      },
    });
    expect(calls).toEqual(["save", "release:2026-10-31T01:00:09.000Z"]);
    expect(result).toEqual({ kind: "released", value: "rel_9", savedFirst: true });
  });

  it("clean: publishes the saved version without saving again", async () => {
    const save = vi.fn();
    const result = await saveThenPublish({
      dirty: false,
      version: "v1",
      save,
      release: async (version) => version,
    });
    expect(save).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "released", value: "v1", savedFirst: false });
  });

  it("a failed save blocks the publish and gives the reason", async () => {
    const release = vi.fn();
    const result = await saveThenPublish({
      dirty: true,
      version: "v1",
      save: async () => ({ ok: false, reason: "no connection" }),
      release,
    });
    expect(release).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "blocked", reason: "no connection" });
  });

  it("a store that was never saved has nothing to publish", async () => {
    const release = vi.fn();
    const result = await saveThenPublish({ dirty: false, version: null, save: vi.fn(), release });
    expect(release).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "no-draft" });
  });

  it("a release that throws is not swallowed", async () => {
    await expect(
      saveThenPublish({
        dirty: false,
        version: "v1",
        save: vi.fn(),
        release: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("offline");
  });
});

describe("publishStatusView: the line beside the Publish button", () => {
  it.each([
    [{ phase: "idle" }, null],
    [{ phase: "saving" }, { text: "storefront.studioStates.publish.savingFirst", role: "status" }],
    [{ phase: "publishing" }, { text: "storefront.studioStates.publish.publishing", role: "status" }],
    [{ phase: "published", text: "Published: ok" }, { text: "Published: ok", role: "status" }],
    [{ phase: "failed", text: "Not published: no connection" }, { text: "Not published: no connection", role: "alert" }],
  ] as const)("%j", (phase, expected) => {
    expect(publishStatusView(phase, t)).toEqual(expected);
  });
});

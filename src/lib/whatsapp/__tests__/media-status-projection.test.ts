import { describe, expect, it } from "vitest";

import { projectInboxLocalMedia } from "../media-status-projection";

describe("Inbox local WhatsApp media status projection", () => {
  it("keeps pending media opaque while exposing only canonical status authority", () => {
    expect(projectInboxLocalMedia("message/1", undefined, undefined)).toEqual({
      state: "pending",
      statusUrl: "/api/inbox/media/message%2F1/status",
    });
  });

  it("projects authenticated read and download URLs only after receipt success", () => {
    expect(projectInboxLocalMedia("message/1", "succeeded", "receipt")).toEqual({
      state: "ready",
      statusUrl: "/api/inbox/media/message%2F1/status",
      readUrl: "/api/inbox/media/message%2F1",
      downloadUrl: "/api/inbox/media/message%2F1?download=1",
      thumbnailUrl: "/api/inbox/media/message%2F1?variant=thumbnail",
    });
  });

  it("projects terminal media fetch failures without read authority", () => {
    expect(projectInboxLocalMedia("message/1", "dead_letter", undefined)).toEqual({
      state: "failed",
      statusUrl: "/api/inbox/media/message%2F1/status",
    });
  });
});

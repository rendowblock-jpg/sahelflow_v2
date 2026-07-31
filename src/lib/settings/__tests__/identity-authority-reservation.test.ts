import { describe, expect, it, vi } from "vitest";

import {
  deleteSetting,
  getAllSettings,
  setSetting,
} from "../index";

function contextWithSettings(rows: Array<{ key: string; value: string }> = []) {
  const upsert = vi.fn();
  const deleteMany = vi.fn();
  const findMany = vi.fn(async () => rows);
  return {
    context: {
      prisma: {
        setting: { upsert, deleteMany, findMany },
      },
    } as never,
    upsert,
    deleteMany,
  };
}

describe("identity authority settings reservation", () => {
  it("blocks generic writes and deletes for the footprint namespace", async () => {
    const { context, upsert, deleteMany } = contextWithSettings();

    await expect(
      setSetting(context, "identity_authority_initialized_v1", "forged"),
    ).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
      statusCode: 403,
    });
    await expect(
      deleteSetting(context, "identity_authority_initialized_v1"),
    ).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
      statusCode: 403,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("strips identity authority footprints from bulk settings reads", async () => {
    const { context } = contextWithSettings([
      {
        key: "identity_authority_initialized_v1",
        value: "internal-authority",
      },
      { key: "theme", value: "dark" },
    ]);

    await expect(getAllSettings(context)).resolves.toEqual({ theme: "dark" });
  });
});

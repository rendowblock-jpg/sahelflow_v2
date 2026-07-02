/**
 * ZR Express delivery adapter tests (TEST-007).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { zrExpressAdapter } from "../zr-express";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ZR Express delivery adapter", () => {
  beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });


  describe("metadata", () => {
    it("has correct id, name, and logo", () => {
      expect(zrExpressAdapter.id).toBe("zrexpress");
      expect(zrExpressAdapter.name).toBeTruthy();
      expect(zrExpressAdapter.logo).toBeTruthy();
    });
  });

});

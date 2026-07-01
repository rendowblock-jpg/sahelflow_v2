/**
 * Maystro delivery adapter tests (TEST-007).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { maystroAdapter } from "../maystro";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Maystro delivery adapter", () => {
  beforeEach(() => mockFetch.mockReset());


  describe("metadata", () => {
    it("has correct id, name, and logo", () => {
      expect(maystroAdapter.id).toBe("maystro");
      expect(maystroAdapter.name).toBeTruthy();
      expect(maystroAdapter.logo).toBeTruthy();
    });
  });

});

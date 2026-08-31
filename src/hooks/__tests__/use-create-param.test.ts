import { describe, expect, it } from "vitest";

import {
  CREATE_PARAM,
  CREATE_PARAM_VALUE,
  buildCreateHref,
  isCreateRequested,
} from "@/hooks/use-create-param";

describe("create deep-link contract", () => {
  it("keeps one stable param name and value", () => {
    expect(CREATE_PARAM).toBe("create");
    expect(CREATE_PARAM_VALUE).toBe("1");
  });

  it("builds create deep-links for the three list surfaces", () => {
    expect(buildCreateHref("/orders")).toBe("/orders?create=1");
    expect(buildCreateHref("/customers")).toBe("/customers?create=1");
    expect(buildCreateHref("/products")).toBe("/products?create=1");
  });

  it("accepts only the canonical create value — anything else is not a create request", () => {
    expect(isCreateRequested("1")).toBe(true);
    expect(isCreateRequested("true")).toBe(false);
    expect(isCreateRequested("")).toBe(false);
    expect(isCreateRequested(null)).toBe(false);
    expect(isCreateRequested(undefined)).toBe(false);
  });
});

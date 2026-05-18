import { describe, it, expect } from "vitest";
import { interpolateTemplate, buildTemplateVars } from "../template-interpolation";

describe("Template Interpolation", () => {
  it("replaces all known variables", () => {
    const result = interpolateTemplate(
      "مرحبا {{customer_name}}! طلبك {{order_number}} تأكد. {{business_name}}",
      { customer_name: "أحمد", order_number: "SF-00012", business_name: "Boutique Nour" }
    );
    expect(result).toBe("مرحبا أحمد! طلبك SF-00012 تأكد. Boutique Nour");
  });

  it("leaves unmatched variables as-is", () => {
    const result = interpolateTemplate("Hello {{unknown_var}}!", {});
    expect(result).toBe("Hello {{unknown_var}}!");
  });

  it("handles missing variables gracefully", () => {
    const result = interpolateTemplate("{{customer_name}} - {{order_number}}", { customer_name: "Sara" });
    expect(result).toBe("Sara - {{order_number}}");
  });

  it("handles empty content", () => {
    const result = interpolateTemplate("", { customer_name: "Test" });
    expect(result).toBe("");
  });

  it("handles numeric values", () => {
    const result = interpolateTemplate("Total: {{total_price}}", { total_price: "4,500 DA" });
    expect(result).toBe("Total: 4,500 DA");
  });
});

describe("buildTemplateVars", () => {
  it("builds vars from order data", () => {
    const vars = buildTemplateVars({
      customer_name: "أحمد",
      order_number: "SF-001",
      wilaya: "Alger",
      items: [{ product_name: "Parfum", quantity: 2 }],
      total_price: 5000,
      business_name: "My Store",
    });
    expect(vars.customer_name).toBe("أحمد");
    expect(vars.order_number).toBe("SF-001");
    expect(vars.wilaya).toBe("Alger");
    expect(vars.product_name).toBe("Parfum");
    expect(vars.items).toBe("2x Parfum");
    expect(vars.business_name).toBe("My Store");
  });

  it("uses defaults for missing fields", () => {
    const vars = buildTemplateVars({});
    expect(vars.customer_name).toBe("الزبون");
    expect(vars.business_name).toBe("SahelFlow");
  });
});

import { describe, expect, it, vi } from "vitest";

import { normalizeBridgeUrl, pingBridge } from "../bridge-client";
import { BRIDGE_COLUMNS, renderBridgeScript } from "../bridge-script";
import {
  autoMapSheetHeaders,
  classifyRowError,
  sheetPhone,
  sheetProblemLabel,
  sheetStatusLabel,
} from "../bridge-sync";

const KEY = "k".repeat(43);

describe("Apps Script bridge script", () => {
  it("embeds the key, owns only the SahelFlow columns and is valid JavaScript", () => {
    const script = renderBridgeScript(KEY);
    expect(script).toContain(`var SAHELFLOW_KEY = "${KEY}";`);
    expect(script).not.toMatch(/__[A-Z_]+__/);
    for (const column of Object.values(BRIDGE_COLUMNS)) expect(script).toContain(column);
    expect(() => new Function(script)).not.toThrow();
  });

  it("refuses a key that could break out of the string literal", () => {
    expect(() => renderBridgeScript('abc";alert(1);//'.padEnd(40, "x"))).toThrow();
  });
});

describe("bridge URL allowlist", () => {
  it("accepts consumer and Workspace web-app URLs, dropping query strings", () => {
    const id = "AKfycbx" + "a".repeat(40);
    expect(normalizeBridgeUrl(`https://script.google.com/macros/s/${id}/exec?x=1`)).toBe(
      `https://script.google.com/macros/s/${id}/exec`,
    );
    expect(normalizeBridgeUrl(`https://script.google.com/a/macros/shop.dz/s/${id}/exec`)).toBe(
      `https://script.google.com/a/macros/shop.dz/s/${id}/exec`,
    );
  });

  it("rejects anything that is not a Google Apps Script web app", () => {
    for (const url of [
      "http://script.google.com/macros/s/AKfycbxaaaaaaaaaaaaaaaaaaaaa/exec",
      "https://evil.example/macros/s/AKfycbxaaaaaaaaaaaaaaaaaaaaa/exec",
      "https://script.google.com.evil.example/macros/s/AKfycbxaaaaaaaaaaaaaaaaaaaaa/exec",
      "https://script.google.com/macros/s/AKfycbxaaaaaaaaaaaaaaaaaaaaa/dev",
      "https://docs.google.com/spreadsheets/d/abc/edit",
      "not a url",
    ]) {
      expect(() => normalizeBridgeUrl(url), url).toThrow();
    }
  });
});

describe("bridge client", () => {
  const target = { url: `https://script.google.com/macros/s/${"A".repeat(30)}/exec`, key: KEY };

  it("sends the key in the body and reads a ping", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ action: "ping", key: KEY });
      return new Response(
        JSON.stringify({
          ok: true,
          version: 1,
          spreadsheetId: "sheet-1",
          spreadsheetName: "Orders",
          sheet: "Sheet1",
          sheets: ["Sheet1"],
          headers: ["Nom", "Téléphone"],
          rowCount: 3,
        }),
        { headers: { "content-type": "application/json; charset=utf-8" } },
      );
    });
    const ping = await pingBridge(target, { fetcher: fetcher as never });
    expect(ping.spreadsheetName).toBe("Orders");
  });

  it("turns a Google sign-in page into a clear 'deploy for Anyone' error", async () => {
    const fetcher = vi.fn(async () => new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } }));
    await expect(pingBridge(target, { fetcher: fetcher as never })).rejects.toMatchObject({
      code: "SHEETS_BRIDGE_ACCESS",
    });
  });

  it("maps a wrong key and an outdated script to coded errors", async () => {
    const reply = (body: unknown) =>
      vi.fn(async () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
    await expect(pingBridge(target, { fetcher: reply({ ok: false, error: "UNAUTHORIZED" }) as never })).rejects.toMatchObject({
      code: "SHEETS_BRIDGE_UNAUTHORIZED",
    });
    await expect(pingBridge(target, { fetcher: reply({ ok: true, version: 1 }) as never })).rejects.toMatchObject({
      code: "SHEETS_BRIDGE_OUTDATED",
    });
  });
});

describe("sheet column mapping", () => {
  it("maps typical French landing-page headers", () => {
    expect(
      autoMapSheetHeaders([
        "Date",
        "Nom et prénom",
        "Numéro de téléphone",
        "Wilaya",
        "Commune",
        "Adresse de livraison",
        "Produit",
        "Quantité",
        "Prix total",
      ]),
    ).toEqual({
      "Nom et prénom": "customerName",
      "Numéro de téléphone": "phone",
      Wilaya: "wilaya",
      Commune: "commune",
      "Adresse de livraison": "address",
      Produit: "productName",
      "Quantité": "quantity",
    });
  });

  it("maps Arabic and English headers and never reuses a field", () => {
    const mapping = autoMapSheetHeaders(["الاسم", "رقم الهاتف", "الولاية", "البلدية", "المنتج", "الكمية", "Order ID"]);
    expect(mapping).toEqual({
      "الاسم": "customerName",
      "رقم الهاتف": "phone",
      "الولاية": "wilaya",
      "البلدية": "commune",
      "المنتج": "productName",
      "الكمية": "quantity",
      "Order ID": "orderNumber",
    });
    expect(new Set(Object.values(mapping)).size).toBe(Object.values(mapping).length);
  });
});

describe("sheet values and labels", () => {
  it("restores the leading zero sheets drop from phone numbers", () => {
    expect(sheetPhone("555123456")).toBe("0555123456");
    expect(sheetPhone("+213 6 61 23 45 67")).toBe("0661234567");
    expect(sheetPhone("0771 23 45 67")).toBe("0771234567");
  });

  it("explains failed rows in the seller's language", () => {
    expect(classifyRowError(["No active catalog product matches the imported identity"])).toBe("product");
    expect(classifyRowError(["Invalid Algerian phone (must be 0[5-7]XXXXXXXX)"])).toBe("phone");
    expect(sheetProblemLabel("fr", "product")).toBe("⚠ Non importée: Produit introuvable dans SahelFlow");
    expect(sheetStatusLabel("ar", "shipped")).toBe("تم الشحن");
    expect(sheetStatusLabel("en", "pending")).toBe("Awaiting confirmation");
  });
});

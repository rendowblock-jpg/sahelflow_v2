/**
 * FD-064 offline order reader — behaviours beyond the frozen corpus.
 * Every phone number uses the reserved non-operator family 0[5-7]000000XX.
 */
import { describe, expect, it } from "vitest";

import { extractWithRegex, readOrderFields } from "@/lib/ai/extraction/regex-extractor";
import { canonicalWilaya, normalizePhone } from "@/lib/ai/extraction/regex-extractor";
import { matchCatalog, sameProduct } from "@/lib/ai/extraction/catalog";

const catalog = [
  { name: "Écouteurs Bluetooth JBL" },
  { name: "Montre Connectée" },
  { name: "Sac à Main Femme" },
  { name: "Coffret Thé et Chocolat" },
  { name: "Tshirt Oversize M" },
  { name: "Tshirt Oversize L" },
];

function read(body: string, extra: { knownPhone?: string } = {}) {
  return extractWithRegex({ body, catalog, ...extra });
}

describe("offline reader — structure is never an item", () => {
  it("reads a labelled address, commune and phone without phantom prices", () => {
    const result = read(
      "Salam, bghit ncommandi Écouteurs Bluetooth JBL, adresse: Cité 1000 Logements Bât B, Bab Ezzouar Alger. Tel: 0500000060",
    );
    expect(result.order).toMatchObject({
      items: [{ productName: "Écouteurs Bluetooth JBL", quantity: 1, catalogMatch: "exact" }],
      phone: "0500000060",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "Cité 1000 Logements Bât B",
    });
    expect(result.order?.items).toHaveLength(1);
    expect(result.isComplete).toBe(true);
  });

  it("reads a labelled Arabic name and a wilaya after 'ولاية'", () => {
    const result = read("سلام، نريد شراء Montre Connectée. الاسم: أمينة شريف. ولاية قسنطينة. الهاتف: 0700000061");
    expect(result.order).toMatchObject({
      customerName: "أمينة شريف",
      wilaya: "Constantine",
      phone: "0700000061",
      items: [{ productName: "Montre Connectée", quantity: 1 }],
    });
  });

  it("keeps a catalog name whole even when it contains a conjunction", () => {
    const result = read("nheb Coffret Thé et Chocolat, Oran 0500000062");
    expect(result.order?.items).toEqual([
      { productName: "Coffret Thé et Chocolat", quantity: 1, catalogMatch: "exact" },
    ]);
  });

  it("does not guess between two close catalog variants", () => {
    const result = read("bghit tshirt oversize, Oran 0500000063");
    expect(result.order?.items[0]).toMatchObject({ productName: "tshirt oversize" });
    expect(result.order?.items[0]?.catalogMatch).toBeUndefined();
  });

  it("lands on the variant when the size is written as an attribute", () => {
    const result = read("bghit 2 tshirt oversize, taille L, Oran 0500000064");
    expect(result.order?.items[0]).toMatchObject({
      productName: "Tshirt Oversize L",
      quantity: 2,
      catalogMatch: "exact",
    });
  });
});

describe("offline reader — phones", () => {
  it.each([
    ["+213 500 00 00 65", "0500000065"],
    ["00213500000065", "0500000065"],
    ["213 5 00 00 00 65", "0500000065"],
    ["05.00.00.00.65", "0500000065"],
    ["05-00-00-00-65", "0500000065"],
  ])("normalizes %s", (written, expected) => {
    expect(read(`2x montre 3000 da Oran ${written}`).order?.phone).toBe(expected);
  });

  it("reads a nine-digit phone only after a label", () => {
    expect(read("2x montre 3000 da Oran, tel 500000066").order?.phone).toBe("0500000066");
    expect(read("2x montre 3000 da Oran 500000066").order?.phone).toBeUndefined();
  });

  it("falls back to the known conversation phone", () => {
    expect(read("2x montre 3000 da Oran", { knownPhone: "0500000067" }).order?.phone).toBe("0500000067");
    expect(normalizePhone("+213500000067")).toBe("0500000067");
  });
});

describe("offline reader — quantities and prices", () => {
  it.each([
    ["nheb zouj montres", 2],
    ["bghit tlata casques", 3],
    ["je veux deux montres", 2],
    ["نحب زوج ساعات", 2],
    ["montre x4", 4],
    ["3 pièces montre", 3],
    ["qte: 5 montre", 5],
  ])("reads the quantity in %s", (body, quantity) => {
    expect(read(`${body}, Oran`).order?.items[0]?.quantity).toBe(quantity);
  });

  it.each([
    ["montre 3 500 da", 3500],
    ["montre prix: 3 500", 3500],
    ["montre 5k", 5000],
    ["montre b zouj alaf", 2000],
    ["montre thmanha alf w nos", 1500],
    ["montre ب ٤٥٠٠ دج", 4500],
    ["montre 3.500 DA", 3500],
  ])("reads the price in %s", (body, price) => {
    expect(read(`bghit ${body}`).order?.items[0]?.unitPrice).toBe(price);
  });

  it("never reads a specification as a price", () => {
    const item = read("je veux un iphone 15 pro max 256gb, Oran").order?.items[0];
    expect(item?.productName).toBe("iphone 15 pro max 256gb");
    expect(item?.unitPrice).toBeUndefined();
  });

  it("keeps a stated total apart from unit prices", () => {
    const order = read("total 9500 da: 2x montre 3500 w 2x casque 1250, Batna").order;
    expect(order?.totalPrice).toBe(9500);
    expect(order?.items.map((item) => item.unitPrice)).toEqual([3500, 1250]);
  });
});

describe("offline reader — geography and names", () => {
  it.each([
    ["livraison lwahran", "Oran"],
    ["tawsil l'annaba", "Annaba"],
    ["wilaya 19", "Sétif"],
    ["ولاية 16", "Alger"],
    ["التوصيل للبليدة", "Blida"],
    ["a bba", "Bordj Bou Arréridj"],
    ["f setif", "Sétif"],
  ])("resolves %s", (phrase, wilaya) => {
    expect(read(`bghit montre 3000 da, ${phrase}`).order?.wilaya).toBe(wilaya);
  });

  it("does not see a wilaya inside ordinary words", () => {
    expect(read("bghit tshirt orange 1500 da, contexte familial").order?.wilaya).toBeUndefined();
  });

  it("infers the wilaya from an unambiguous commune", () => {
    expect(readOrderFields({ body: "rani f Bab Ezzouar, nheb montre" }).order).toMatchObject({
      wilaya: "Alger",
      commune: "Bab Ezzouar",
    });
  });

  it("stops a name at the wilaya that follows it", () => {
    const order = read("smiti ahmed wahran, nheb montre 3000 da").order;
    expect(order?.customerName).toBe("Ahmed");
    expect(order?.wilaya).toBe("Oran");
  });

  it("does not take a verb for a name", () => {
    expect(read("ana nheb montre 3000 da Oran").order?.customerName).toBeUndefined();
  });

  it("canonicalizes free-form wilaya answers", () => {
    expect(canonicalWilaya("wahran")).toBe("Oran");
    expect(canonicalWilaya("16")).toBe("Alger");
    expect(canonicalWilaya("البليدة")).toBe("Blida");
    expect(canonicalWilaya("Atlantis")).toBeUndefined();
  });
});

describe("offline reader — conversation is not an order", () => {
  it.each([
    "salam khoya, kifach rak?",
    "3andkom casque bluetooth?",
    "Do you deliver to Ouargla?",
    "merci bcp, ok",
    "واش كاين التوصيل لوهران؟",
  ])("finds no item in %s", (body) => {
    expect(read(body).order).toBeNull();
  });
});

describe("catalog matching", () => {
  it("matches exactly after folding and closely when one product clearly wins", () => {
    expect(matchCatalog("ecouteurs bluetooth jbl", catalog)).toEqual({ name: "Écouteurs Bluetooth JBL", kind: "exact" });
    expect(matchCatalog("écouteurs JBL", catalog)).toEqual({ name: "Écouteurs Bluetooth JBL", kind: "close" });
    expect(matchCatalog("montre", catalog)).toEqual({ name: "Montre Connectée", kind: "close" });
    expect(matchCatalog("parfum", catalog)).toBeUndefined();
  });

  it("recognizes the same product across plural and extra words", () => {
    expect(sameProduct("tshirt rouge", "tshirts")).toBe(true);
    expect(sameProduct("jean", "tshirts")).toBe(false);
  });
});

describe("offline reader — lists and signatures", () => {
  it("keeps every entry of a '+' list once one entry is an item", () => {
    const order = read("Bonjour, Sac à Main Femme + Parfum Oud. Nadia, Blida. 0500000070").order;
    expect(order?.items.map((item) => item.productName)).toEqual(["Sac à Main Femme", "Parfum Oud"]);
    expect(order?.customerName).toBe("Nadia");
    expect(order?.wilaya).toBe("Blida");
  });

  it("does not turn chatter joined by 'et' into items", () => {
    expect(read("contexte familial et amis, merci").order).toBeNull();
  });

  it("does not take a closing formula for a signature", () => {
    expect(read("bghit montre 3000 da, Oran. Bonne Journée").order?.customerName).toBeUndefined();
  });
});

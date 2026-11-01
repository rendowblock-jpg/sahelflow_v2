// A few plain rules that read a customer's sentence the way a seller's eye does.
// Used by the home page demo only: the server renders the default sentence with it, the browser re-runs it while the
// visitor types. It is NOT the product's assistant and the page says so. Same file in both places (copied to /assets).

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Lower case, Latin accents off, Arabic digits to Latin, Arabic letter variants folded. */
export function norm(s) {
  return String(s ?? "")
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064B-\u065F\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

/** The sample shop. Prices are samples, not SahelFlow's. */
export const DELIVERY = 600;
export const PRODUCTS = [
  { key: "shirt", price: 2400, sizes: "letters", kw: ["قميص", "قمصان", "تيشرت", "chemise", "t-shirt", "tshirt", "shirt"] },
  { key: "sneakers", price: 6900, sizes: "numbers", kw: ["حذاء", "احذيه", "سباط", "صباط", "basket", "chaussure", "sneaker", "shoe"] },
  { key: "bag", price: 3900, sizes: "none", kw: ["شنطه", "شنط", "حقيبه", "حقائب", "sac", "bag"] },
];
export const COLORS = [
  { key: "white", kw: ["ابيض", "بيض", "blanc", "white"] },
  { key: "black", kw: ["اسود", "سود", "كحل", "noir", "black"] },
  { key: "blue", kw: ["ازرق", "زرق", "bleu", "blue"] },
];
export const LABELS = {
  ar: { shirt: "قميص", sneakers: "حذاء رياضي", bag: "شنطة", white: "أبيض", black: "أسود", blue: "أزرق" },
  fr: { shirt: "Chemise", sneakers: "Baskets", bag: "Sac", white: "blanc", black: "noir", blue: "bleu" },
  en: { shirt: "Shirt", sneakers: "Sneakers", bag: "Bag", white: "white", black: "black", blue: "blue" },
};
/** [code, Arabic, French, English, ...extra spellings] : the larger towns only. */
export const WILAYAS = [
  [1, "أدرار", "Adrar"],
  [5, "باتنة", "Batna"],
  [6, "بجاية", "Béjaïa", "Bejaia"],
  [7, "بسكرة", "Biskra"],
  [8, "بشار", "Béchar", "Bechar"],
  [9, "البليدة", "Blida"],
  [10, "البويرة", "Bouira"],
  [13, "تلمسان", "Tlemcen"],
  [14, "تيارت", "Tiaret"],
  [15, "تيزي وزو", "Tizi Ouzou", "Tizi-Ouzou"],
  [16, "الجزائر", "Alger", "Algiers", "دزاير"],
  [17, "الجلفة", "Djelfa"],
  [19, "سطيف", "Sétif", "Setif"],
  [21, "سكيكدة", "Skikda"],
  [22, "سيدي بلعباس", "Sidi Bel Abbès", "Sidi Bel Abbes"],
  [23, "عنابة", "Annaba"],
  [25, "قسنطينة", "Constantine"],
  [26, "المدية", "Médéa", "Medea"],
  [27, "مستغانم", "Mostaganem"],
  [28, "المسيلة", "M'Sila", "Msila"],
  [29, "معسكر", "Mascara"],
  [30, "ورقلة", "Ouargla"],
  [31, "وهران", "Oran", "wahran"],
  [35, "بومرداس", "Boumerdès", "Boumerdes"],
  [39, "الوادي", "El Oued"],
  [47, "غرداية", "Ghardaïa", "Ghardaia"],
];

/** Colour word agreeing with the product (feminine in Arabic for a bag, feminine and plural in French). */
const COLOR_FORMS = {
  ar: { white: ["أبيض", "بيضاء"], black: ["أسود", "سوداء"], blue: ["أزرق", "زرقاء"] },
  fr: { white: ["blanc", "blanche"], black: ["noir", "noire"], blue: ["bleu", "bleue"] },
  en: { white: ["white", "white"], black: ["black", "black"], blue: ["blue", "blue"] },
};
const FEMININE = { ar: ["bag"], fr: ["shirt", "sneakers"], en: [] };
function colorWord(color, product, qty, locale) {
  const forms = (COLOR_FORMS[locale] ?? COLOR_FORMS.en)[color.key];
  const f = (FEMININE[locale] ?? []).includes(product?.key) ? 1 : 0;
  const w = forms[f];
  const plural = locale === "fr" && (qty > 1 || product?.key === "sneakers");
  return plural && !w.endsWith("s") ? `${w}s` : w;
}
function productWord(product, qty, locale) {
  const L = LABELS[locale] ?? LABELS.en;
  if (qty > 1 && (locale === "fr" || locale === "en") && product.key !== "sneakers") return `${L[product.key]}s`;
  return L[product.key];
}

const money = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/[\u202f\u00a0\s]/g, "\u00a0");
export const fmtMoney = (n, locale) => `${money(n)}\u00a0${locale === "ar" ? "دج" : "DA"}`;

function firstIndex(text, words) {
  let best = -1;
  for (const w of words) {
    const i = text.indexOf(norm(w));
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/** → { product, qty, size, color, wilaya, phone, total, missing[] } with nulls where the sentence says nothing. */
export function readOrder(text, locale = "en") {
  const L = LABELS[locale] ?? LABELS.en;
  let rest = norm(text);

  let phone = null;
  const ph = rest.match(/(?:\+?213|0)[\s.-]*([567])((?:[\s.-]*\d){8})/);
  if (ph) {
    const d = `0${ph[1]}${ph[2]}`.replace(/\D/g, "");
    phone = `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
    rest = rest.replace(ph[0], " ");
  }

  let product = null;
  let at = Infinity;
  for (const p of PRODUCTS) {
    const i = firstIndex(rest, p.kw);
    if (i >= 0 && i < at) { at = i; product = p; }
  }

  let color = null;
  for (const c of COLORS) if (firstIndex(rest, c.kw) >= 0) { color = c; break; }

  let wilaya = null;
  for (const w of WILAYAS) {
    const names = w.slice(1);
    if (firstIndex(rest, names) >= 0) { wilaya = { code: w[0], name: locale === "ar" ? w[1] : locale === "en" && w[3] && /alger/i.test(w[2]) ? w[3] : w[2] }; break; }
  }

  let size = null;
  if (product?.sizes === "letters") {
    const m = rest.match(/(?:^|[^a-z])(xxl|xl|xs|s|m|l)(?![a-z])/);
    if (m) { size = m[1].toUpperCase(); rest = rest.replace(m[0], " "); }
  } else if (product?.sizes === "numbers") {
    const m = rest.match(/(?:^|\D)(3[5-9]|4[0-7])(?!\d)/);
    if (m) { size = m[1]; rest = rest.replace(m[1], " "); }
  }

  let qty = 1;
  const num = rest.match(/(?:^|\D)(\d{1,2})(?!\d)/);
  if (num && Number(num[1]) >= 1 && Number(num[1]) <= 30) qty = Number(num[1]);
  else if (/(قميصين|شنطتين|حذاءين|اثنين|اثنان|deux|two|zouj|zawj)/.test(rest) || /(قميصين|شنطتين|حذاءين)/.test(norm(text))) qty = 2;
  else if (/(ثلاث|trois|three)/.test(rest)) qty = 3;

  const missing = [];
  if (!product) missing.push("product");
  if (!wilaya) missing.push("wilaya");
  if (!phone) missing.push("phone");

  const goods = product ? product.price * qty : null;
  return {
    product: product ? { key: product.key, label: productWord(product, qty, locale), price: product.price } : null,
    color: color ? { key: color.key, label: colorWord(color, product, qty, locale) } : null,
    qty,
    size,
    wilaya,
    phone,
    goods,
    delivery: product ? DELIVERY : null,
    total: product ? goods + DELIVERY : null,
    missing,
  };
}

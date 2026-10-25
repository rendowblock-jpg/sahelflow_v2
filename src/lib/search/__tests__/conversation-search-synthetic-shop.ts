import type { PrismaClient } from "@prisma/client";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

/**
 * A synthetic shop for the conversation-search tests: invented Algerian names and phones, messages in French,
 * Arabic and arabizi, written like the app writes them (contact and body sealed under the record's own id, plain
 * rows for the fillers). Nothing here is real data. Words that must exist in exactly one place:
 *   zorglub    the OLDEST message of a conversation that has 70 messages (outside the 50 the search reads)
 *   tikjda     the NEWEST message of the newest conversation
 *   ferroudja  the only message of the OLDEST filler conversation (outside the newest 500)
 */
export const REAL_CONVERSATIONS = 60;
export const FILLER_CONVERSATIONS = 520;
export const WINDOW_SIZE = 500;

export type ShopFacts = {
  messageCount: number;
  phoneA: string;
  phoneB: string;
  beyondFiftyId: string;
  outsideWindowId: string;
  newestId: string;
  someId: string;
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRENCH_NAMES = ["Amine Benali", "Karim Bensalem", "Sofiane Boudiaf", "Nadia Merabet", "Samira Khelifi", "Lynda Hamidi", "Hakim Zerrouki", "Imane Belkacem", "Walid Slimani", "Rania Bouzid"];
const ARABIC_NAMES = ["محمد الأمين", "كريم بن علي", "فاطمة الزهراء", "يوسف بلقاسم", "نور الهدى", "عبد القادر مرابط", "مريم شريف", "أيمن منصوري"];
const ARABIZI_NAMES = ["Yacine Cherif", "Mounir Mansouri", "Meriem Benali", "Abdelkader Boudjemaa", "Fatima Zohra Haddad", "Djamel Bekkouche"];
const FRENCH = [
  "bonjour, je voudrais commander une coque samsung", "combien coûte la livraison à Alger ?", "merci beaucoup, c'est parfait",
  "est-ce disponible en stock ?", "le colis est arrivé ce matin", "paiement à la livraison possible ?", "pouvez-vous confirmer l'adresse",
  "livraison à Blida cette semaine", "je souhaite un retour du produit", "quelle wilaya livrez-vous ?", "bonsoir, votre prix est négociable ?",
];
const ARABIC = [
  "السلام عليكم", "بغيت نطلب كوفرتة سامسونج", "واش كاين التوصيل لوهران", "كم سعر التوصيل", "شكرا بزاف", "الطلبية وصلت اليوم",
  "الكتاب الجديد متوفر", "هل المنتج متوفر عندكم", "الدفع عند الاستلام", "أريد طلبية ثانية",
];
const ARABIZI = [
  "salam khoya", "wach kayen livraison l wahran", "chhal el prix", "bghit nechri 2 coques", "mrc bzaf", "n7eb ncommandi",
  "kifach ndir paiement", "3andek stock", "saha khoya, nebghi nchouf el colis", "bghit nesaqsi 3la el livraison",
];
const PREFIXES = ["0555", "0661", "0770", "0550", "0698", "0773"];

export async function insertSyntheticShop(seed: PrismaClient, options: { sealed: boolean }): Promise<ShopFacts> {
  const codec = createProtectedPiiCodec(seed as never, TEST_SHOP_CONTEXT);
  const next = random(54);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  const seal = async (model: "Message" | "Conversation", id: string, values: Record<string, string>) => {
    if (!options.sealed) return values;
    const sealed = await codec.encryptFields({ id, ...values }, Object.keys(values), model, id);
    return Object.fromEntries(Object.keys(values).map((key) => [key, String(sealed[key])]));
  };

  const usedPhones = new Set<string>();
  const phoneOf = () => {
    for (;;) {
      const phone = `${pick(PREFIXES)}${String(Math.floor(next() * 1_000_000)).padStart(6, "0")}`;
      if (!usedPhones.has(phone)) {
        usedPhones.add(phone);
        return phone;
      }
    }
  };

  const newestAt = Date.UTC(2026, 9, 20, 12, 0, 0);
  const messageRows: Array<{ id: string; conversationId: string; body: string; direction: string; timestamp: Date }> = [];
  const facts: Partial<ShopFacts> = {};
  for (let index = 0; index < REAL_CONVERSATIONS; index += 1) {
    const id = `syn-conv-${index}`;
    const language = index % 3;
    const name = language === 0 ? pick(FRENCH_NAMES) : language === 1 ? pick(ARABIC_NAMES) : pick(ARABIZI_NAMES);
    const phone = index % 20 === 19 ? null : phoneOf();
    const contact = await seal("Conversation", id, phone === null ? { contactName: name } : { contactName: name, contactPhone: phone });
    const labels = index % 4 === 0 ? JSON.stringify(["vip", "retard"]) : null;
    await seed.conversation.create({
      data: {
        id,
        channel: index % 2 === 0 ? "whatsapp" : "messenger",
        contactName: contact.contactName!,
        contactPhone: contact.contactPhone ?? null,
        sourceId: `syn-source-${index}`,
        lastMessageAt: new Date(newestAt - index * 3_600_000),
        unreadCount: index % 5,
        status: index % 7 === 0 ? "pending" : "open",
        priority: index % 6 === 0 ? "high" : null,
        labels,
      },
    });
    if (index === 3 && phone) facts.phoneA = phone;
    if (index === 4 && phone) facts.phoneB = phone;
    const count = index === 7 ? 70 : 12 + ((index * 13) % 29);
    const pool = language === 0 ? FRENCH : language === 1 ? ARABIC : ARABIZI;
    for (let at = 0; at < count; at += 1) {
      let body = `${pick(pool)}${next() < 0.3 ? ` / ${pick(ARABIZI)}` : ""}`;
      if (index === 7 && at === 0) body = "zorglub, bghit nesaqsi 3la el livraison";
      if (index === 0 && at === count - 1) body = "tikjda, merci beaucoup";
      const messageId = `syn-msg-${index}-${at}`;
      const sealed = await seal("Message", messageId, { body });
      messageRows.push({
        id: messageId,
        conversationId: id,
        body: sealed.body!,
        direction: at % 2 === 0 ? "inbound" : "outbound",
        timestamp: new Date(Date.UTC(2026, 9, 1) + index * 1_000 + at * 60_000),
      });
    }
    if (index === 7) facts.beyondFiftyId = id;
    if (index === 0) facts.newestId = id;
    if (index === 10) facts.someId = id;
  }

  const fillers = Array.from({ length: FILLER_CONVERSATIONS }, (_, number) => ({
    id: `syn-filler-${number}`,
    channel: "whatsapp",
    contactName: `Client Filler ${number}`,
    contactPhone: `0790${String(number).padStart(6, "0")}`,
    sourceId: `syn-filler-source-${number}`,
    lastMessageAt: new Date(Date.UTC(2026, 8, 1) - number * 60_000),
  }));
  await seed.conversation.createMany({ data: fillers });
  const outside = fillers[FILLER_CONVERSATIONS - 1]!;
  const outsideMessageId = "syn-msg-outside";
  const outsideBody = await seal("Message", outsideMessageId, { body: "ferroudja, quel est le prix ?" });
  messageRows.push({ id: outsideMessageId, conversationId: outside.id, body: outsideBody.body!, direction: "inbound", timestamp: new Date(Date.UTC(2026, 8, 1)) });
  facts.outsideWindowId = outside.id;

  for (let start = 0; start < messageRows.length; start += 100) {
    await seed.message.createMany({ data: messageRows.slice(start, start + 100) });
  }
  return { ...facts, messageCount: messageRows.length } as ShopFacts;
}

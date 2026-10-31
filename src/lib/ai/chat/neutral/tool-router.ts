/**
 * Tool router: choose which of the registry's tool schemas one chat request
 * carries, so a provider with a small per-minute token budget (Groq free tier)
 * is not sent all 29 schemas for every question.
 *
 * Rule: the router may send too MUCH, never too LITTLE. A question with no
 * keyword, or a follow-up ("et hier ?"), falls back to a larger set. It only
 * chooses what the model is OFFERED. It grants no authority: execution, the
 * permission gate, proposals and the blocked-tool policy stay in agent.ts and
 * the registry. A tool the policy map blocks is never in `getAllToolDefinitions()`
 * and so can never be selected here.
 */
import type { AiChatLocale } from "../locale-context";
import {
  aiCapabilityGroups,
  type AiCapabilityGroupId,
} from "../tools/capability-groups";
import { getAllToolDefinitions, type ToolDefinition } from "../tools/registry";
import { definitionsToNeutral } from "./openai-compat";
import type { NeutralTool } from "./types";

/**
 * Always offered: the cheapest general READ tools, which are also the tools
 * behind the four counters of the shop context note (pending orders, orders
 * today, low stock, deliveries in transit). Schema sizes measured with
 * JSON.stringify of the definition: get_stats 231, get_low_stock_products 272,
 * get_pending_deliveries 290, list_recent_orders 425 characters (1,218 in all).
 */
export const BASE_TOOL_NAMES: readonly string[] = [
  "get_stats",
  "get_low_stock_products",
  "get_pending_deliveries",
  "list_recent_orders",
];

/**
 * Added when no keyword matched: one cheap read entry point per topic, so any
 * data question can still start. A larger set than the base, far smaller than
 * all 29 tools (all 21 read tools would cost about 1,000 more tokens and push
 * every fallback request over 3,000). Reads only: no write is offered without
 * a topic.
 */
export const FALLBACK_TOOL_NAMES: readonly string[] = [
  "search_orders",
  "search_customers",
  "search_products",
  "get_delivery_status",
  "get_revenue_report",
  "get_returns_summary",
  "search_conversations",
];

/**
 * Offered, and nothing else, for an order-creation request (PB-AI-GROQ-WRITE-LOOKUPS). On the free
 * Groq plan every step re-sends the tool list: with the whole read toolbox the assistant spent its
 * 12,000-token turn before it could record the proposal. The write tool needs the customer id and
 * each product id (create_order takes ids, not names), so exactly the two lookups that give them
 * are offered next to it. This only narrows what is OFFERED: the permission gate, the proposal
 * and the approval card are unchanged and still stand between the model and the database.
 */
export const ORDER_CREATION_TOOL_NAMES: readonly string[] = [
  "search_customers",
  "search_products",
  "create_order",
];

// Create-verb + optional filler + order noun, on the normalized text (no accents). The verb must
// come BEFORE the noun and only an article/adjective may sit between them, so "ajoute une note
// a la commande 5" and "la commande creee hier" are not creation requests.
const CREATE_FILLER = "(?:(?:un|une|nouvelle|nouveau|autre|new|a|an|another|draft|brouillon|jdid|jdida|1|one)\\s+)*";
const ORDER_CREATION_LATIN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:cree|creer|creez|ajoute|ajouter|ajoutez|enregistre|enregistrer|saisis|saisir|fais|faire|create|add|make|place|register|record|enter|submit|draft|raise|dir|zid|sajel|sjel|sajjel|3mel)\\s+${CREATE_FILLER}(?:commandes?|comandes?|kommandes?|orders?|talab|tlab|talbia|talabia|cmd)(?![\\p{L}\\p{N}])(?!\\s+(?:note|notes|status|statut|number|numero|id)(?![\\p{L}\\p{N}]))`,
  "u",
);
const ORDER_CREATION_ARABIC = new RegExp(
  "(?<![\\u0621-\\u064a])(?:اعمل|عمل|سجل|تسجيل|انشئ|انشي|انشاء|انشا|اضف|اضافه|زيد|ضيف|ادخل)(?:\\s+(?:لي|ليا|جديد|جديده|واحد|واحده))*\\s+(?:طلبيه|طلب|كوماند|كومند|اوردر)(?![\\u0621-\\u064a])",
  "u",
);
// A second action in the same sentence (cancel, delete, status, confirm): keep the old, larger set.
const OTHER_ACTION_LATIN = /(?<![\p{L}\p{N}])(?:annul|cancel|supprim|delet|remov|statut|status|confirm)/u;
const OTHER_ACTION_ARABIC: readonly string[] = ["الغ", "حذف", "تاكيد"];

export function isOrderCreationQuestion(text: string): boolean {
  const normalized = normalizeQuestion(text);
  if (OTHER_ACTION_LATIN.test(normalized) || OTHER_ACTION_ARABIC.some((stem) => normalized.includes(stem))) {
    return false;
  }
  return ORDER_CREATION_LATIN.test(normalized) || ORDER_CREATION_ARABIC.test(normalized);
}

export interface RouterHistoryItem {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string }>;
}

export interface ToolRoute {
  groups: AiCapabilityGroupId[];
  tools: NeutralTool[];
  /** True when the larger set was used (no keyword, or a follow-up). */
  fallback: boolean;
  reason: "keywords" | "follow-up" | "no-keyword" | "order-creation";
}

const GROUP_ORDER: readonly AiCapabilityGroupId[] = [
  "orders",
  "customers",
  "products",
  "delivery",
  "insights",
  "conversations",
];

// Stems are matched after normalize(): lowercase, no accents or Arabic marks,
// alef/ya/ta-marbuta unified. Latin stems match at a word start; Arabic stems
// match anywhere (Arabic glues prefixes on: "الطلبات", "للزبائن").
const KEYWORDS: Record<AiCapabilityGroupId, { latin: string[]; arabic: string[] }> = {
  orders: {
    latin: ["command", "comand", "kommand", "cmd", "order", "pending", "attente", "annul", "cancel", "talab", "tlab", "statut", "status", "confirm"],
    arabic: ["طلب", "كوماند", "كومند", "اوردر", "معلق", "الغاء", "الغي", "ملغ"],
  },
  customers: {
    latin: ["client", "clien", "customer", "buyer", "acheteur", "zbon", "zboun", "zabon", "zbayen", "zbaen", "clyan", "klyan", "telephone", "phone"],
    arabic: ["زبون", "زبائن", "عميل", "عملاء", "كليان", "كلاين", "مشتري", "هاتف"],
  },
  products: {
    latin: ["produit", "product", "stock", "stok", "rupture", "inventaire", "inventory", "article", "item", "prix", "price", "sel3a", "sl3a", "mantoj", "montaj", "so3r", "se3r", "catalogue", "variant", "quantit", "sku"],
    arabic: ["منتج", "مخزون", "مخزن", "سلعه", "سلع", "ستوك", "سعر", "اسعار", "بضاع", "كميه", "نفد", "نفاد"],
  },
  delivery: {
    latin: ["livr", "deliver", "colis", "parcel", "shipping", "shipment", "courier", "transporteur", "expedi", "tracking", "suivi", "tawsil", "twsil", "tawsel", "yalidine", "zrexpress", "zr express", "procolis", "noest", "ecotrack", "wsel", "wasal", "stopdesk", "transit"],
    arabic: ["توصيل", "تسليم", "شحن", "ليفريزون", "ليفرزون", "مندوب", "طرد", "ياليدين", "تتبع", "ناقل"],
  },
  insights: {
    latin: ["chiffre", "revenu", "revenue", "benefice", "profit", "rentab", "statisti", "stats", "vente", "sales", "retour", "return", "rapport", "report", "taux", "rate", "meilleur", "best", "top", "classement", "tendance", "trend", "wilaya", "rbe7", "rb7", "mabi3", "lbi3", "kpi", "performance", "analytic"],
    arabic: ["مبيع", "ارباح", "ربح", "ايراد", "احصائي", "تقرير", "مرتجع", "رقم الاعمال", "افضل", "الاكثر", "نسبه", "ولايه", "ولاي"],
  },
  conversations: {
    latin: ["message", "conversation", "whatsapp", "discussion", "chat", "tiktok", "inbox", "rissala", "risala", "rsayel", "msg", "watsap", "wtsp", "hadra"],
    arabic: ["رسال", "رسائل", "رسايل", "محادث", "واتساب", "واتس", "دردش", "تيكتوك", "تيك توك", "مراسل"],
  },
};

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MATCHERS = GROUP_ORDER.map((id) => {
  const latin = KEYWORDS[id].latin.map(normalizeQuestion).map(escapeRegExp);
  const arabic = KEYWORDS[id].arabic.map(normalizeQuestion);
  return {
    id,
    latin: new RegExp(`(?<![\\p{L}\\p{N}])(?:${latin.join("|")})`, "u"),
    arabic,
  };
});

function matchGroups(text: string): AiCapabilityGroupId[] {
  const normalized = normalizeQuestion(text);
  return MATCHERS.filter(
    (m) => m.latin.test(normalized) || m.arabic.some((stem) => normalized.includes(stem)),
  ).map((m) => m.id);
}

/** Topics of the latest turns: tools already called, and keywords of the last two seller questions. */
function groupsFromHistory(
  history: RouterHistoryItem[],
  groupOfTool: Map<string, AiCapabilityGroupId>,
): Set<AiCapabilityGroupId> {
  const groups = new Set<AiCapabilityGroupId>();
  for (const message of history.slice(-6)) {
    for (const call of message.toolCalls ?? []) {
      const group = groupOfTool.get(call.name);
      if (group) groups.add(group);
    }
  }
  const userTexts = history.filter((m) => m.role === "user").slice(-2);
  for (const message of userTexts) {
    for (const group of matchGroups(message.content)) groups.add(group);
  }
  return groups;
}

export function selectToolsForQuestion(
  input: { question: string; locale: AiChatLocale; history?: RouterHistoryItem[] },
  definitions: ToolDefinition[] = getAllToolDefinitions(),
): ToolRoute {
  // `locale` is accepted for the caller's symmetry but not used on purpose:
  // an Arabizi or French question is common in an Arabic UI and the reverse.
  if (isOrderCreationQuestion(input.question)) {
    const creation = definitions.filter((d) => ORDER_CREATION_TOOL_NAMES.includes(d.name));
    // Narrow only when the write tool itself is in the list: never offer too little.
    if (creation.some((d) => d.name === "create_order")) {
      return {
        groups: ["orders", "customers", "products"],
        tools: definitionsToNeutral(creation),
        fallback: false,
        reason: "order-creation",
      };
    }
  }
  const history = input.history ?? [];
  const capability = aiCapabilityGroups();
  const groupOfTool = new Map<string, AiCapabilityGroupId>();
  const namesOfGroup = new Map<AiCapabilityGroupId, string[]>();
  for (const group of capability) {
    namesOfGroup.set(group.id, group.tools.map((t) => t.name));
    for (const tool of group.tools) {
      groupOfTool.set(tool.name, group.id);
    }
  }

  const names = new Set<string>(BASE_TOOL_NAMES);
  const addWholeGroups = (ids: AiCapabilityGroupId[]) => {
    for (const id of ids) for (const name of namesOfGroup.get(id) ?? []) names.add(name);
  };

  let groups: AiCapabilityGroupId[];
  let reason: ToolRoute["reason"];
  const matched = matchGroups(input.question);
  if (matched.length > 0) {
    groups = matched;
    reason = "keywords";
    addWholeGroups(groups);
  } else {
    // Nothing recognised: offer the fallback reads, plus every tool (writes too)
    // of the topics of the recent turns. With no topic at all, reads only.
    const fromHistory = groupsFromHistory(history, groupOfTool);
    reason = history.length > 0 ? "follow-up" : "no-keyword";
    for (const name of FALLBACK_TOOL_NAMES) names.add(name);
    groups = fromHistory.size > 0 ? GROUP_ORDER.filter((id) => fromHistory.has(id)) : [...GROUP_ORDER];
    if (fromHistory.size > 0) addWholeGroups(groups);
  }

  const offered = definitions.filter((d) => names.has(d.name));
  return {
    groups,
    tools: definitionsToNeutral(offered),
    fallback: reason !== "keywords",
    reason,
  };
}

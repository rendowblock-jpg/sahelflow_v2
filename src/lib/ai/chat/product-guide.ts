/**
 * The SahelFlow product guide the AI agent answers "how do I…" questions from.
 *
 * One authoritative, reviewed description of the shipped interface: which page
 * to open (`route`, an in-app path the chat renders as a link), the steps in
 * order, and the facts a seller trips on. It travels in the agent's system
 * instruction (`aiChatProductKnowledgeContext`), and the agent must not
 * describe features that are not in here. Written once in English; the agent
 * answers in the seller's interface language, using the screen names given
 * here.
 *
 * Keep it true to the product: when a screen, label or flow changes, change
 * its guide in the same pull request.
 */

export interface ProductGuide {
  id: string;
  title: string;
  /** In-app page the guide starts from. */
  route: string;
  steps: readonly string[];
  notes?: readonly string[];
}

/** Sidebar order as the seller sees it (English labels). */
export const PRODUCT_NAVIGATION = [
  "Dashboard (/dashboard)",
  "Orders (/orders) › Confirmation Queue (/orders/confirmation-queue)",
  "Inbox (/inbox)",
  "Products (/products)",
  "Customers (/customers)",
  "Delivery (/deliveries)",
  "Returns (/returns)",
  "Analytics (/analytics)",
  "Accounting (/accounting) › COD Reconciliation (/accounting/cod-reconciliation)",
  "Risk (/risk)",
  "Storefront Builder (/storefronts)",
  "Automations (/automations)",
  "AI Agents (/agents)",
  "Import/Export (/imports)",
  "Settings (/settings)",
] as const;

export const PRODUCT_GUIDES: readonly ProductGuide[] = [
  {
    id: "setup-checklist",
    title: "Finish the setup checklist",
    route: "/onboarding",
    steps: [
      "Open the setup checklist (/onboarding). It has four steps: Shop basics, Connect WhatsApp, Couriers and AI.",
      "Shop basics: enter the shop name, phone and wilaya/commune. They print on orders and delivery slips.",
      "Every step can be skipped and reopened from the checklist; a step is marked done only when it is really configured.",
      "The last screen shows what is ready and links to anything still missing.",
    ],
  },
  {
    id: "connect-whatsapp",
    title: "Connect WhatsApp",
    route: "/inbox",
    steps: [
      "Open Inbox (/inbox) and press \"Connect WhatsApp\" (it is also step 2 of the setup checklist).",
      "On the phone: WhatsApp → Settings → Linked devices → Link a device.",
      "Scan the QR code shown in SahelFlow. It refreshes every 15 seconds; press \"Refresh QR\" if it expired.",
      "When the inbox shows \"WhatsApp connected\", new customer messages arrive live.",
    ],
    notes: [
      "Saved conversations stay readable when WhatsApp is disconnected; sending replies needs the connection.",
      "The link uses WhatsApp's linked-devices feature on the seller's own number.",
    ],
  },
  {
    id: "order-from-whatsapp",
    title: "Turn a WhatsApp conversation into an order",
    route: "/inbox",
    steps: [
      "Open Inbox (/inbox) and select the customer's conversation.",
      "In the Order section, choose the customer messages that make up the order (\"Use this message for order review\"). Several messages can be combined.",
      "Review what was extracted — name, phone, wilaya, commune, products and quantities — and correct anything wrong.",
      "Confirm to create the order. SahelFlow never saves an extracted order without this confirmation.",
    ],
    notes: [
      "With a Gemini key (Settings → AI) and consent, AI handles messy Darija/French/Arabic messages; without it, an offline rules extractor still works.",
    ],
  },
  {
    id: "create-order",
    title: "Create an order by hand",
    route: "/orders",
    steps: [
      "Open Orders (/orders) and press \"Create Order\".",
      "Enter the customer (name and phone), wilaya and commune, then the products and quantities.",
      "Save. The order then moves through the normal status flow (see \"Order statuses\").",
    ],
  },
  {
    id: "confirm-orders",
    title: "Confirm orders before shipping",
    route: "/orders/confirmation-queue",
    steps: [
      "Open Orders → Confirmation Queue (/orders/confirmation-queue). It lists the orders waiting for confirmation.",
      "Check the customer's risk signals (phone reputation, delivery history), then call or message the customer.",
      "Confirm the order to send it on to shipping, or cancel it with a reason.",
    ],
    notes: ["Confirming before shipping is the single biggest lever against COD returns."],
  },
  {
    id: "order-statuses",
    title: "Order statuses",
    route: "/orders",
    steps: [
      "draft → pending (waiting for confirmation) → confirmed → shipped → delivered.",
      "Final outcomes: returned, refused (the customer refused at the door) and cancelled.",
      "A delivered order can still become returned (post-delivery COD return).",
    ],
  },
  {
    id: "connect-courier",
    title: "Connect a delivery company",
    route: "/settings?group=delivery",
    steps: [
      "Open Settings → Delivery (/settings?group=delivery). SahelFlow asks for your PIN again before showing courier credentials.",
      "Press \"Configure\" on Yalidine, Maystro Delivery, ZR Express or EcoTrack Pro.",
      "Paste the API credentials from your courier account, save, then test the connection.",
    ],
    notes: [
      "Credentials are encrypted on this computer and never shown again.",
      "A courier can be live for some actions (for example tracking) and not for others; SahelFlow only offers what is certified.",
    ],
  },
  {
    id: "ship-order",
    title: "Ship an order",
    route: "/orders",
    steps: [
      "Make sure the order is confirmed and a courier is connected (Settings → Delivery).",
      "Open the order (Orders → the order) and press \"Ship\", or select several confirmed orders in Orders and press \"Ship Selected\".",
      "The shipment is created with the courier and its tracking appears on the order and in Delivery (/deliveries).",
    ],
  },
  {
    id: "track-deliveries",
    title: "Track deliveries",
    route: "/deliveries",
    steps: [
      "Open Delivery (/deliveries) to see every shipment and its current courier status.",
      "Open a delivery for its full timeline.",
      "You can also ask me \"where is order CMD-…\" and I will look it up.",
    ],
  },
  {
    id: "returns",
    title: "Handle returns and exchanges",
    route: "/returns",
    steps: [
      "Return requests start from a delivered order: open it in Orders and create the return.",
      "Follow and resolve each case in Returns (/returns — \"After-Sales & Returns\"), including exchanges.",
      "Stock and money records follow the return; nothing is silently deleted.",
    ],
  },
  {
    id: "cod-reconciliation",
    title: "Reconcile cash on delivery",
    route: "/accounting/cod-reconciliation",
    steps: [
      "Open Accounting → COD Reconciliation (/accounting/cod-reconciliation).",
      "Match what each courier paid you against the orders it delivered.",
      "Anything delivered but not yet paid stays visible until it is settled.",
    ],
  },
  {
    id: "products-stock",
    title: "Products and stock",
    route: "/products",
    steps: [
      "Open Products (/products) to add a product with its price and stock.",
      "Set a low-stock threshold so SahelFlow warns you before you run out.",
      "Stock moves automatically with orders and returns; manual corrections are recorded.",
    ],
  },
  {
    id: "customers-risk",
    title: "Customers, risk and blacklist",
    route: "/customers",
    steps: [
      "Customers (/customers) shows each customer's orders, total spent and delivery rate.",
      "Risk (/risk) shows refusal risk by wilaya and phone; Settings → Phone reputation controls how phones are scored.",
      "Use the risk score in the Confirmation Queue to decide which orders to call first.",
    ],
  },
  {
    id: "analytics",
    title: "Analytics and reports",
    route: "/analytics",
    steps: [
      "Analytics (/analytics) shows revenue, orders, top products and sales by wilaya over time.",
      "Analytics → extraction (/analytics/extraction) shows how well order extraction performs.",
      "Settings → Daily reports sends a daily summary to your phone at the time you choose.",
      "You can also ask me directly, for example \"revenue this week\" or \"sales by wilaya\".",
    ],
  },
  {
    id: "storefront",
    title: "Create and publish an online store",
    route: "/storefronts",
    steps: [
      "Open Storefront Builder (/storefronts) and press \"New store\".",
      "Choose a name, an address (slug) and the products to sell.",
      "Design it in the Studio (theme, colours, sections), then publish. Orders from the store arrive in SahelFlow as COD orders.",
      "Pause, edit or roll back to an earlier version at any time from the store's history.",
    ],
    notes: ["Stores also support quantity-tier offers, cart recovery and reviews from real orders."],
  },
  {
    id: "automations",
    title: "Automate repetitive work",
    route: "/automations",
    steps: [
      "Open Automations (/automations).",
      "Start from a template — WhatsApp confirmation when an order is created, tracking message when shipped, low-stock alert, thank-you after delivery — or press \"New automation\".",
      "Pick the trigger, optional conditions (for example wilaya or order amount) and the actions, then activate it.",
      "Each automation keeps a run history so you can see what it did.",
    ],
  },
  {
    id: "ai-agent",
    title: "Use the AI agent",
    route: "/agents",
    steps: [
      "Ask questions about your shop in AI Agents (/agents): orders, customers, stock, deliveries, revenue. Images can be attached.",
      "When you ask me to change something (create an order, change a status, adjust stock…), I prepare a proposal. It runs only after you approve it on the action card.",
      "Add or change the Gemini key and consent in Settings → AI (/settings?group=ai). A free key comes from Google AI Studio.",
    ],
  },
  {
    id: "import-export",
    title: "Import or export data",
    route: "/imports",
    steps: [
      "Open Import/Export (/imports).",
      "Upload a CSV file, match its columns to SahelFlow fields (Column Mapping), check the preview, then \"Confirm Import\".",
      "Exports download your data as files you can open in a spreadsheet.",
    ],
  },
  {
    id: "team",
    title: "Invite a team member",
    route: "/settings?group=team",
    steps: [
      "Open Settings → Team & access (/settings?group=team) and create an invitation: role (Manager, Operator or Viewer), shop access and how long it stays valid.",
      "Copy the one-time invitation token and give it to your teammate. It is shown once only.",
      "On their computer, they open SahelFlow, choose \"Join a team\" on the sign-in screen, paste the token and set their name, login ID and PIN.",
      "Change roles, suspend or remove members from the same page. Revoke an invitation that was not used.",
    ],
  },
  {
    id: "license",
    title: "Free trial, licence and buying",
    route: "/settings?group=license",
    steps: [
      "The licence screen offers a free 7-day trial (one per computer, needs internet once).",
      "To buy: pay by BaridiMob or CCP, then send the licence request code (from the licence screen or Settings → License) to SahelFlow on WhatsApp.",
      "You receive your licence; paste it into \"Activate my licence\". SahelFlow checks it on this computer.",
    ],
    notes: ["The request code identifies this installation only; it grants nothing by itself."],
  },
  {
    id: "backup",
    title: "Back up and restore",
    route: "/settings?group=backup",
    steps: [
      "Open Settings → Backup (/settings?group=backup) and press \"Create Backup\".",
      "Keep a copy somewhere safe outside this computer.",
      "Restoring replaces the current data with the backup, so create a fresh backup first.",
    ],
  },
  {
    id: "commerce-channels",
    title: "Connect Shopify, WooCommerce or YouCan",
    route: "/settings?group=commerce",
    steps: [
      "Open Settings → Commerce channels (/settings?group=commerce).",
      "Connect your Shopify, WooCommerce or YouCan store; its orders then arrive in SahelFlow.",
      "Synchronization and recovery tools on the same page show anything that failed to import.",
    ],
  },
  {
    id: "meta-pixel",
    title: "Meta Pixel for storefronts",
    route: "/settings?group=meta-pixel",
    steps: [
      "Open Settings → Meta Pixel (/settings?group=meta-pixel).",
      "Enter your Pixel (and Conversions API) details so storefront orders are reported to your ads.",
    ],
  },
  {
    id: "shops",
    title: "Several shops",
    route: "/settings?group=shops",
    steps: [
      "Switch shop from the shop selector at the top of the window.",
      "Rename, archive, recover or delete shops in Settings → Shops (/settings?group=shops). Your licence sets how many shops you can run.",
    ],
  },
  {
    id: "security",
    title: "PIN and security",
    route: "/settings?group=security",
    steps: [
      "Change your PIN and review active sessions in Settings → Security (/settings?group=security).",
      "Sensitive pages (courier keys, AI key) ask for the PIN again before opening.",
    ],
  },
  {
    id: "interface",
    title: "Language, theme, search and notifications",
    route: "/dashboard",
    steps: [
      "Switch Arabic, French or English from the language button at the top; toggle light/dark from the theme button. Settings → Appearance has more options.",
      "Press Ctrl K (or the search bar) to find orders, customers, products and conversations.",
      "The bell shows notifications; dismiss them individually.",
    ],
  },
];

/**
 * The whole guide as compact text for the system instruction. The tool
 * vocabulary is frozen (FRC-2), so the knowledge travels as context rather
 * than as a lookup tool; at roughly three thousand tokens it fits every turn.
 */
export function productGuideText(): string {
  return PRODUCT_GUIDES.map((guide) =>
    [
      `### ${guide.title} [${guide.id}] — open ${guide.route}`,
      ...guide.steps.map((step, index) => `${index + 1}. ${step}`),
      ...(guide.notes ?? []).map((note) => `Note: ${note}`),
    ].join("\n"),
  ).join("\n\n");
}

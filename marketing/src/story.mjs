// Copy for the cinematic sections of the home page (live product demo, the
// five-stop order journey, the Algeria map, the product tour and the closing
// call). Same rule as content.mjs: every claim stays inside what SahelFlow
// actually does today. Demo values are illustrative and labelled as such.

const ar = {
  heroEyebrow: "مصمَّم لتجّار الدفع عند الاستلام في الجزائر",
  scroll: "اكتشف",
  demo: {
    label: "عرض حي للتطبيق",
    app: { inbox: "صندوق الوارد", orders: "الطلبات", delivery: "التوصيل", accounting: "المحاسبة", agents: "المساعد" },
    customer: "أمينة · بجاية",
    online: "متصلة الآن",
    msg1: "سلام، نحب نطلب الجلابة البيضاء مقاس M 🙏",
    msg2: "بجاية، حي 1000 مسكن · 0555 12 34 56",
    reply: "مرحبا أمينة! نأكد معاك الطلبية؟",
    ai: "استخراج بالذكاء الاصطناعي",
    fields: [
      ["الاسم", "أمينة بلقاسم"],
      ["الهاتف", "0555 12 34 56"],
      ["الولاية", "06 · بجاية"],
      ["المنتج", "جلابة بيضاء · M"],
    ],
    total: ["المجموع", "4 800 دج"],
    order: "الطلب ORD-0128",
    courier: "Yalidine · للمنزل",
    statuses: ["جديد", "مؤكَّد", "مشحون", "مُسلَّم"],
    cash: "تمّت المطابقة",
    kpis: [["طلبات اليوم", "37"], ["نسبة التسليم", "84%"], ["صافي الربح", "126 400 دج"]],
  },
  loop: {
    eyebrow: "المسار الكامل",
    title: "من «السلام عليكم» إلى مال مُحصَّل. تلقائياً.",
    steps: [
      { k: "message", title: "الرسالة تصل", text: "الزبون يكتب على واتساب — بالدارجة أو الفرنسية، في رسالة واحدة أو خمس." },
      { k: "extract", title: "الذكاء الاصطناعي يستخرج الطلب", text: "الاسم والهاتف والولاية والمنتجات تُملأ تلقائياً، وأنت تراجع قبل الحفظ." },
      { k: "confirm", title: "تأكيد بنقرة", text: "طابور التأكيد يرتّب من تتصل به أولاً، ومحرك المخاطر ينبّهك قبل أن تشحن." },
      { k: "ship", title: "الشحن والتتبع", text: "الشحنة تُنشأ مع شركة التوصيل، وحالتها تتحدّث وحدها حتى باب الزبون." },
      { k: "cash", title: "المال يُطابَق", text: "ما حصّلته شركة التوصيل، ما اقتطعته، وما وصلك فعلاً — بالدينار." },
    ],
  },
  bento: { eyebrow: "المنصة", title: "ثمانية محرّكات. طلب واحد. صفر إدخال مكرّر." },
  map: {
    eyebrow: "58 ولاية",
    title: "كل ولاية. كل شركة توصيل. خريطة واحدة.",
    text: "أسعار التوصيل لكل ولاية، للمنزل وللمكتب، مع Yalidine و ZR Express و EcoTrack و Maystro — وتحليلات المرتجعات تُريك أين تربح وأين تخسر.",
    legend: "توضيح: شحنات تنطلق من مستودعك",
  },
  stats: [
    { value: 58, label: "ولاية مغطاة" },
    { value: 4, label: "شركات توصيل مدمجة" },
    { value: 3, label: "لغات كاملة" },
    { value: 7, label: "أيام تجربة مجانية" },
  ],
  tour: { eyebrow: "داخل التطبيق", title: "هذا هو المنتج الحقيقي، لا نموذجاً تسويقياً." },
  vault: { offline: "يعمل دون إنترنت", encrypted: "مشفَّر AES-256" },
  final: { title: "توقّف عن إدارة الفوضى. ابدأ إدارة شركة." },
};

const fr = {
  heroEyebrow: "Conçu pour les vendeurs COD en Algérie",
  scroll: "Découvrir",
  demo: {
    label: "Démo en direct de l'application",
    app: { inbox: "Boîte de réception", orders: "Commandes", delivery: "Livraison", accounting: "Comptabilité", agents: "Assistant" },
    customer: "Amina · Béjaïa",
    online: "en ligne",
    msg1: "Salam, je veux la djellaba blanche taille M 🙏",
    msg2: "Béjaïa, cité 1000 logements · 0555 12 34 56",
    reply: "Bonjour Amina ! On confirme la commande ?",
    ai: "Extraction par IA",
    fields: [
      ["Nom", "Amina Belkacem"],
      ["Téléphone", "0555 12 34 56"],
      ["Wilaya", "06 · Béjaïa"],
      ["Produit", "Djellaba blanche · M"],
    ],
    total: ["Total", "4 800 DA"],
    order: "Commande ORD-0128",
    courier: "Yalidine · domicile",
    statuses: ["Nouvelle", "Confirmée", "Expédiée", "Livrée"],
    cash: "Rapproché",
    kpis: [["Commandes du jour", "37"], ["Taux de livraison", "84 %"], ["Bénéfice net", "126 400 DA"]],
  },
  loop: {
    eyebrow: "Le parcours complet",
    title: "Du « Salam » à l'argent encaissé. Automatiquement.",
    steps: [
      { k: "message", title: "Le message arrive", text: "Le client écrit sur WhatsApp — en darja ou en français, en un message ou en cinq." },
      { k: "extract", title: "L'IA extrait la commande", text: "Nom, téléphone, wilaya et produits se remplissent seuls ; vous vérifiez avant d'enregistrer." },
      { k: "confirm", title: "Confirmation en un clic", text: "La file de confirmation vous dit qui appeler en premier, et le moteur de risque vous alerte avant l'envoi." },
      { k: "ship", title: "Expédition et suivi", text: "Le colis est créé chez le livreur et son statut se met à jour tout seul jusqu'à la porte du client." },
      { k: "cash", title: "L'argent est rapproché", text: "Ce que le livreur a encaissé, ce qu'il a retenu et ce que vous avez vraiment reçu — en dinars." },
    ],
  },
  bento: { eyebrow: "La plateforme", title: "Huit moteurs. Une commande. Zéro double saisie." },
  map: {
    eyebrow: "58 wilayas",
    title: "Chaque wilaya. Chaque livreur. Une seule carte.",
    text: "Tarifs de livraison par wilaya, domicile et bureau, avec Yalidine, ZR Express, EcoTrack et Maystro — et l'analyse des retours vous montre où vous gagnez et où vous perdez.",
    legend: "Illustration : colis au départ de votre entrepôt",
  },
  stats: [
    { value: 58, label: "wilayas couvertes" },
    { value: 4, label: "livreurs intégrés" },
    { value: 3, label: "langues complètes" },
    { value: 7, label: "jours d'essai gratuit" },
  ],
  tour: { eyebrow: "Dans l'application", title: "Voici le vrai produit. Pas une maquette." },
  vault: { offline: "Fonctionne hors ligne", encrypted: "Chiffré AES-256" },
  final: { title: "Arrêtez de gérer le chaos. Dirigez une entreprise." },
};

const en = {
  heroEyebrow: "Built for cash-on-delivery sellers in Algeria",
  scroll: "Explore",
  demo: {
    label: "Live demo of the app",
    app: { inbox: "Inbox", orders: "Orders", delivery: "Delivery", accounting: "Accounting", agents: "Assistant" },
    customer: "Amina · Béjaïa",
    online: "online",
    msg1: "Salam, I'd like the white djellaba, size M 🙏",
    msg2: "Béjaïa, 1000 Logements · 0555 12 34 56",
    reply: "Hi Amina! Shall we confirm your order?",
    ai: "AI extraction",
    fields: [
      ["Name", "Amina Belkacem"],
      ["Phone", "0555 12 34 56"],
      ["Wilaya", "06 · Béjaïa"],
      ["Product", "White djellaba · M"],
    ],
    total: ["Total", "4,800 DA"],
    order: "Order ORD-0128",
    courier: "Yalidine · home",
    statuses: ["New", "Confirmed", "Shipped", "Delivered"],
    cash: "Reconciled",
    kpis: [["Orders today", "37"], ["Delivery rate", "84%"], ["Net profit", "126,400 DA"]],
  },
  loop: {
    eyebrow: "The whole journey",
    title: "From “Salam” to settled cash. Automatically.",
    steps: [
      { k: "message", title: "The message arrives", text: "Your customer writes on WhatsApp — in Darja or French, in one message or five." },
      { k: "extract", title: "AI extracts the order", text: "Name, phone, wilaya and products fill themselves in; you review before saving." },
      { k: "confirm", title: "Confirm in one click", text: "The confirmation queue tells you who to call first, and the risk engine warns you before you ship." },
      { k: "ship", title: "Ship and track", text: "The parcel is created with your courier and its status updates itself all the way to the door." },
      { k: "cash", title: "The cash is reconciled", text: "What the courier collected, what they kept and what actually reached you — in dinars." },
    ],
  },
  bento: { eyebrow: "The platform", title: "Eight engines. One order. Zero double entry." },
  map: {
    eyebrow: "58 wilayas",
    title: "Every wilaya. Every courier. One map.",
    text: "Delivery rates for every wilaya, home and office, with Yalidine, ZR Express, EcoTrack and Maystro — and return analytics show you where you win and where you lose.",
    legend: "Illustration: parcels leaving your warehouse",
  },
  stats: [
    { value: 58, label: "wilayas covered" },
    { value: 4, label: "built-in couriers" },
    { value: 3, label: "full languages" },
    { value: 7, label: "day free trial" },
  ],
  tour: { eyebrow: "Inside the app", title: "This is the real product. Not a mock-up." },
  vault: { offline: "Works offline", encrypted: "AES-256 encrypted" },
  final: { title: "Stop managing chaos. Start running a company." },
};

export const STORY = { ar, fr, en };

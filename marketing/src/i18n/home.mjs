// Home page copy for the Carnet look (ar / fr / en). Drafts: the Founder reads the Arabic and French natively.
export const HOME = {
  ar: {
    hero: { h1: "الدفتر الذي تعلّم إدارة المتجر", lead: "طلباتك من واتساب ومن المتجر ومما تكتبه بيدك، في قائمة واحدة. الدفتر يقول لك مَن تتصل به أولاً ولماذا، ويحسب الكاش الذي ينتظرك عند شركات التوصيل. يعمل على حاسوبك Windows حتى بلا إنترنت.", tag: "تشتريه مرة، يبقى عندك" },
    ledger: { page: "صفحة اليوم", date: "الجمعة 30 أكتوبر", wa: "واتساب", msg: "سلام خويا، نحب نكوماندي 2 قميص تايل L، أنا في العلمة سطيف", draftNote: "مسودة بانتظار موافقتك", item: "قميص قطن × 2 (L)", place: "العلمة، سطيف", place2: "سطيف · العلمة", approve: "اعتمد", id: "2841", name: "أمينة بن سالم", phone: "0555 ·· ·· 41", stamp: "اتصل أولاً", hint: "رقم غير مكتمل", caption: "مثال توضيحي: الرسالة تصير مسودة، ثم سطراً في الدفتر بعد اعتمادك.", replay: "شاهد المشهد مرة أخرى" },
    call: { h2: "اتصل أولاً، والسبب مكتوب في الهامش", p: "قبل أن تشحن ترى مَن تتصل به أولاً. يُكتب السبب في الهامش بالأحمر، حتى لا يضيع بين مئة طلب.", note: "قبل الشحن لا بعده", rows: [{ mg: "رقم غير مكتمل", who: "أمينة بن سالم", what: "قميص قطن × 2", amount: 4800, stamp: "toCall", label: "اتصل أولاً" }, { mg: "", who: "ليلى عمراني", what: "عطر عود 50 مل", amount: 12500, stamp: "confirmed", label: "مؤكَّدة" }] },
    day: { h2: "يوم البائع في خمس ختمات", steps: [
      { stamp: "جديدة", title: "يصل الطلب", text: "من واتساب أو من المتجر أو تكتبه بيدك، فيقع في القائمة نفسها." },
      { stamp: "اتصل أولاً", title: "ينبّهك الهامش", text: "إن كان في الطلب ما يستدعي مكالمة، كُتب سببه بالأحمر قبل الشحن." },
      { stamp: "مؤكَّدة", title: "تعتمد أنت", text: "الذكاء الاصطناعي يقترح مسودة الرد والطلب فقط. لا يُرسَل ولا يُكتب شيء إلا بموافقتك." },
      { stamp: "شُحنت", title: "يُسجَّل الطرد", text: "باسم شركة التوصيل التي اخترتها، وتبقى حالته أمامك." },
      { stamp: "سُلِّمت", title: "يُقفل أسبوع الكاش", text: "ما سُلِّم وما رُفض وكم ما يزال ينتظر التحصيل، مجموعاً كما في دفتر الحساب." },
    ] },
    shots: { h2: "من الشاشة نفسها", lead: "صور حقيقية من البرنامج، لا رسوم أُعيد تركيبها." },
    int: { p: "لكل ربط حالته الصادقة مكتوبة بجانب اسمه." },
  },
  fr: {
    hero: { h1: "Le carnet qui a appris à tenir la boutique", lead: "Vos commandes WhatsApp, de la boutique ou écrites à la main, dans une seule liste. Le carnet vous dit qui appeler d'abord et pourquoi, et compte le cash qui vous attend chez les transporteurs. Il tourne sur votre PC Windows, même sans internet.", tag: "On l'achète une fois, il reste à vous" },
    ledger: { page: "Page du jour", date: "Vendredi 30 octobre", wa: "WhatsApp", msg: "Salam khouya, je veux commander 2 chemises en L, je suis à El Eulma, Sétif", draftNote: "Brouillon en attente de votre accord", item: "Chemise coton × 2 (L)", place: "El Eulma, Sétif", place2: "Sétif · El Eulma", approve: "Valider", id: "2841", name: "Amina Ben Salem", phone: "0555 ·· ·· 41", stamp: "Appeler d'abord", hint: "Numéro incomplet", caption: "Exemple illustratif : le message devient un brouillon, puis une ligne du carnet une fois que vous validez.", replay: "Revoir la scène" },
    call: { h2: "Appeler d'abord, la raison est dans la marge", p: "Avant d'expédier, vous voyez qui appeler en premier. La raison est écrite en rouge dans la marge, pour qu'elle ne se perde pas parmi cent commandes.", note: "Avant l'envoi, pas après", rows: [{ mg: "Numéro incomplet", who: "Amina Ben Salem", what: "Chemise coton × 2", amount: 4800, stamp: "toCall", label: "Appeler d'abord" }, { mg: "", who: "Leïla Amrani", what: "Parfum oud 50 ml", amount: 12500, stamp: "confirmed", label: "Confirmée" }] },
    day: { h2: "La journée du vendeur en cinq tampons", steps: [
      { stamp: "Nouvelle", title: "La commande arrive", text: "De WhatsApp, de la boutique ou saisie à la main, elle tombe dans la même liste." },
      { stamp: "Appeler d'abord", title: "La marge vous prévient", text: "Si quelque chose cloche, la raison est écrite en rouge avant l'expédition." },
      { stamp: "Confirmée", title: "Vous validez", text: "L'IA propose seulement un brouillon de réponse et de commande. Rien n'est envoyé ni écrit sans votre accord." },
      { stamp: "Expédiée", title: "Le colis est enregistré", text: "Au nom du transporteur que vous avez choisi, et son état reste sous vos yeux." },
      { stamp: "Livrée", title: "La semaine de cash se clôt", text: "Livré, refusé, reste à encaisser : le cahier de caisse additionne comme un livre de comptes." },
    ] },
    shots: { h2: "L'écran, tel quel", lead: "De vraies captures du logiciel, pas des dessins refaits." },
    int: { p: "Chaque connexion porte son vrai statut à côté de son nom." },
  },
  en: {
    hero: { h1: "The ledger that learned to run the shop", lead: "Your WhatsApp, storefront and hand-typed orders in one list. The ledger tells you who to call first and why, and adds up the cash waiting at the couriers. It runs on your Windows PC, even offline.", tag: "Buy it once, it stays yours" },
    ledger: { page: "Today's page", date: "Friday 30 October", wa: "WhatsApp", msg: "Salam khouya, I'd like 2 shirts in L, I'm in El Eulma, Sétif", draftNote: "Draft waiting for your approval", item: "Cotton shirt × 2 (L)", place: "El Eulma, Sétif", place2: "Sétif · El Eulma", approve: "Approve", id: "2841", name: "Amina Ben Salem", phone: "0555 ·· ·· 41", stamp: "Call first", hint: "Number incomplete", caption: "An illustration: the message becomes a draft, then a line in the ledger once you approve.", replay: "Watch again" },
    call: { h2: "Call first, and the reason sits in the margin", p: "Before you ship you see who to call first. The reason is written in red in the margin, so it doesn't get lost among a hundred orders.", note: "Before shipping, not after", rows: [{ mg: "Number incomplete", who: "Amina Ben Salem", what: "Cotton shirt × 2", amount: 4800, stamp: "toCall", label: "Call first" }, { mg: "", who: "Leila Amrani", what: "Oud perfume 50 ml", amount: 12500, stamp: "confirmed", label: "Confirmed" }] },
    day: { h2: "A seller's day in five stamps", steps: [
      { stamp: "New", title: "The order arrives", text: "From WhatsApp, from your shop or typed by hand, it lands in the same list." },
      { stamp: "Call first", title: "The margin warns you", text: "If something is off, the reason is written in red before you ship." },
      { stamp: "Confirmed", title: "You approve", text: "The AI only drafts the reply and the order. Nothing is sent or written without your approval." },
      { stamp: "Shipped", title: "The parcel is recorded", text: "Under the courier you chose, and its status stays in front of you." },
      { stamp: "Delivered", title: "The cash week closes", text: "Delivered, refused, still to collect: the cash book adds it up like an account ledger." },
    ] },
    shots: { h2: "The screen itself", lead: "Real screenshots of the app, not redrawn pictures." },
    int: { p: "Every connection carries its real status beside its name." },
  },
};

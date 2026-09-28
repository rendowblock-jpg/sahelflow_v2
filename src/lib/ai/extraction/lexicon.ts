/**
 * Vocabulary of Algerian COD messages (FD-064): Darija in Arabic and Latin
 * script, French, English and Modern Standard Arabic. Every entry is written
 * the way customers type it; matching happens on the folded view, so accents,
 * case and Arabic letter variants do not need separate spellings.
 */

export const GREETINGS = [
  "salam alaykoum", "salam alikoum", "salam alaikoum", "salamou alaykoum",
  "salam", "slm", "slt", "salut", "bonjour", "bonsoir", "bjr", "hello", "hi",
  "hey", "ahla", "ahlan", "marhba", "saha", "sba7 lkhir", "sbah el khir",
  "السلام عليكم", "السلام", "سلام عليكم", "سلام", "مرحبا", "اهلا", "صباح الخير",
  "مساء الخير", "صح", "خويا", "khoya", "khouya", "madame", "monsieur",
];

/** Words that announce an order. Their presence makes a clause an order line. */
export const ORDER_INTENTS = [
  "bghit", "bghina", "bghit nchri", "nheb", "nhab", "n7eb", "n7ab", "nhebb",
  "habit", "7abit", "habin", "khasni", "khassni", "5asni", "lazemli", "nchri",
  "nechri", "nachri", "nchrii", "ncommandi", "ncomandi", "nkoumandi",
  "nkomandi", "ncommander", "ntlob", "notlob", "ndir commande", "ndir",
  "je veux", "je voudrais", "j'aimerais", "je souhaite", "je desire",
  "je prends", "je prend", "je commande", "commander", "acheter", "prendre",
  "i want to order", "i want to buy", "i want", "i'd like", "i would like",
  "i need", "to order", "order", "buy", "commande", "commande pour",
  "بغيت", "بغينا", "نبغي", "نبي", "نحب", "حبيت", "حاب", "حابه", "نريد", "اريد",
  "بدي", "خاصني", "نشري", "نشرى", "نشرو", "نطلب", "اطلب", "شراء", "نكوموندي",
  "طلبيه", "طلب",
];

/** Exchange requests: the item wanted comes after "b / par / with". */
export const EXCHANGE_VERBS = [
  "nbedel", "nbadel", "nbeddel", "nbdel", "echanger", "changer", "exchange",
  "بدل", "نبدل", "نبادل",
];
export const EXCHANGE_TARGET = ["b", "par", "contre", "with", "for", "ب", "بـ"];

/** Politeness and fillers that never belong in a product or customer name. */
export const FILLERS = [
  "svp", "stp", "s'il vous plait", "s'il te plait", "please", "pls", "plz",
  "merci", "thanks", "thank you", "lah ykhalik", "allah ykhalik", "barak allah fik",
  "من فضلك", "عافاك", "لو سمحت", "الله يخليك", "شكرا", "ok", "okay", "wesh",
  "واش", "ya", "يا", "3afak", "afak", "ida mumkin", "si possible",
  "bonne journee", "bonne soiree", "bon courage", "inchallah", "incha allah",
  "ان شاء الله", "bslama", "bye", "salutations", "cordialement", "saha ftourkoum",
];

/** Words that may sit at a product-name edge but never alone. */
export const EDGE_STOPWORDS = [
  "de", "du", "des", "d'", "la", "le", "les", "l'", "un", "une", "of", "the",
  "a", "an", "for", "pour", "à", "au", "aux", "en", "من", "ب", "في", "ف", "f",
  "fi", "b", "l", "dial", "dyal", "diel", "ta3", "mta3", "nta3", "نتاع", "ديال",
  "تاع", "w", "و", "et", "and", "with", "jdid", "jdida", "جديد", "جديده",
  "livraison", "tawsil", "twsil", "التوصيل", "توصيل", "delivery", "to", "vers",
  "wilaya", "ولايه", "مع", "m3a", "avec", "هذا", "هذي", "hada", "hadi", "had",
  "wahed", "wahda", "chwiya", "khir", "ghir", "برك", "berk", "dak", "dik",
  "qte", "quantite", "prix", "price", "السعر", "سعر", "thmano", "le koll",
  "koll", "كل", "total", "المجموع",
];

/** A clause reduced to one of these carries no product. */
export const NON_PRODUCT_WORDS = [
  "stock", "prix", "price", "combien", "chhal", "ch7al", "bch7al", "bechhal",
  "شحال", "بشحال", "قداش", "disponible", "dispo", "kayen", "kayn", "كاين",
  "oui", "non", "yes", "no", "wach", "win", "fin", "وين", "فين", "bien", "mlih",
  "livraison", "tawsil", "adresse", "address", "commande", "order", "rani",
  "راني", "numero", "num", "tel", "merci", "رقمي", "total", "cash", "khlas",
  "خلاص", "wilaya", "commune", "baladiya", "بلديه", "ولايه", "lyoum", "ghodwa",
  "aujourd'hui", "demain", "today", "tomorrow", "sa3a", "heure", "fiha",
  "ykon", "yji", "tji", "jat", "ma", "pas", "rien", "chi", "شي", "والو",
];

/** Words that introduce the price of a line. */
export const PRICE_CUES = [
  "prix", "price", "a", "à", "b", "bi", "bel", "pour", "for", "at",
  "thmano", "thamano", "thmanha", "soumou", "soum", "swam", "swem", "tal3a",
  "tla3", "ytla3", "yetla3", "jat", "tji", "ب", "بـ", "ثمن", "ثمنو", "ثمنه",
  "سعر", "بسعر", "السعر", "سومو", "سومه", "يطلع", "طالعه", "جات", "تجي",
];

/** Words that mark a price as the ORDER total rather than a unit price. */
export const TOTAL_CUES = [
  "total", "ttc", "en tout", "au total", "montant", "somme", "kamel", "ga3",
  "gaa", "المجموع", "مجموع", "المبلغ", "الكل", "كامل", "in total", "altogether",
];

/** Words that mark a price as per-unit. */
export const UNIT_PRICE_MARKERS = [
  "le koll", "lkoll", "l koll", "koll wahda", "kol wahda", "koul wahda",
  "koll wa7da", "kol wa7da", "koll wahed", "chacun", "chacune", "l'unite",
  "l'unité", "la piece", "la pièce", "par piece", "par pièce", "each",
  "per piece", "per unit", "apiece", "للقطعه", "للحبه", "للواحده", "للوحده",
  "كل وحده", "كل قطعه", "كل واحده", "كل حبه", "الوحده", "الحبه", "القطعه",
];

export const CURRENCIES = [
  "da", "dzd", "dz", "dinar", "dinars", "dinar algerien", "دج", "د.ج", "د ج",
  "دينار", "دنانير",
];

/** Quantity units that follow a number ("3 pièces", "2 قطعة"). */
export const QUANTITY_UNITS = [
  "x", "×", "pcs", "pc", "pieces", "piece", "pièces", "pièce", "unites",
  "unite", "unités", "unité", "boites", "boite", "boîtes", "boîte", "paires",
  "paire", "pairs", "pair", "sachets", "sachet", "flacons", "flacon",
  "bouteilles", "bouteille", "kg", "kilo", "kilos", "habba", "hebba", "7abba",
  "7ebba", "habbat", "قطعة", "قطعه", "قطع", "حبة", "حبه", "حبات", "كيلو",
  "كغ", "علب", "علبة", "زوج", "ازواج",
];

/** Measurement suffixes after which a number is a spec, not a price. */
export const SPEC_UNITS = [
  "gb", "go", "tb", "mb", "mo", "mah", "watt", "watts", "hz", "cm", "mm", "ml",
  "g", "gr", "kg", "inch", "pouces", "pouce", "mp", "ans", "years", "mois",
  "cc", "%", "px",
];

/** Number words for quantities (and thousands in prices). */
export const NUMBER_WORDS: Record<string, number> = {
  wahed: 1, wahd: 1, wahda: 1, wa7ed: 1, wa7da: 1, "واحد": 1, "واحده": 1,
  "وحده": 1, un: 1, une: 1, one: 1,
  zouj: 2, zoudj: 2, zoj: 2, jouj: 2, zouz: 2, "زوج": 2, "جوج": 2, "زوز": 2,
  deux: 2, two: 2, "اثنين": 2, "زوجه": 2, "ثنين": 2,
  tlata: 3, tleta: 3, tlatha: 3, "ثلاثه": 3, "ثلاث": 3, "تلاته": 3, trois: 3,
  three: 3,
  arba3a: 4, rab3a: 4, "اربعه": 4, "ربعه": 4, quatre: 4, four: 4,
  khamsa: 5, "خمسه": 5, cinq: 5, five: 5,
  setta: 6, sitta: 6, "سته": 6, six: 6,
  seb3a: 7, sab3a: 7, "سبعه": 7, sept: 7, seven: 7,
  tmanya: 8, thmanya: 8, "ثمانيه": 8, "تمنيه": 8, huit: 8, eight: 8,
  tes3a: 9, tas3a: 9, "تسعه": 9, neuf: 9, nine: 9,
  "3achra": 10, achra: 10, "عشره": 10, dix: 10, ten: 10,
};

/** Articles count as "one" but are not evidence that a quantity was stated. */
export const ARTICLE_WORDS = new Set(["un", "une", "a", "an"]);

export const THOUSAND_WORDS = [
  "alaf", "alef", "alf", "alfin", "mille", "milles", "الاف", "ألاف", "آلاف",
  "الف", "ألف", "الفين", "k",
];

/** Labels that precede a phone number. Masked together with the number. */
export const PHONE_LABELS = [
  "tel", "tél", "tele", "telephone", "téléphone", "phone", "mobile", "portable",
  "num", "numero", "numéro", "mon num", "mon numero", "mon numéro", "n°", "nmr",
  "ttl", "number", "my number", "whatsapp", "رقمي", "رقم الهاتف", "رقم", "الهاتف",
  "هاتفي", "هاتف", "تليفون", "التليفون", "النمرة", "نمرتي", "noumrou", "nemra",
  "nemrti", "ra9mi", "raqmi",
];

/** Name introductions. `weak` ones need a clean ending to count. */
export const NAME_INTROS_STRONG = [
  "اسمي", "إسمي", "الاسم", "الإسم", "سميتي", "الاسم الكامل", "الاسم و اللقب",
  "smiti", "esmi", "ismi", "smiyti", "my name is", "my name's", "name",
  "full name", "nom", "prenom", "prénom", "nom et prenom", "nom et prénom",
  "nom complet", "je m'appelle", "je m appelle", "je mappelle", "moi c'est",
];
export const NAME_INTROS_WEAK = ["ana", "انا", "أنا", "this is", "c'est"];

export const ADDRESS_LABELS = [
  "adresse", "address", "adr", "l'adresse", "my address", "mon adresse",
  "العنوان", "عنواني", "عنوان", "3onwan", "l3onwan", "lanwan", "domicile",
];

/** A clause starting with one of these is an address line. */
export const ADDRESS_KEYWORDS = [
  "cité", "cite", "cit", "hay", "حي", "rue", "شارع", "nahj", "نهج",
  "lotissement", "résidence", "residence", "immeuble", "imm", "bloc",
  "bt", "bat", "bât", "batiment", "bâtiment", "quartier", "qt", "village",
  "douar", "دوار", "قريه", "عماره", "route", "avenue", "boulevard", "bd", "coop",
  "cooperative", "logements", "logts", "lgts", "ilot", "n°", "villa", "فيلا",
];

/** Continuation of an address line ("…, bat 9"). */
export const ADDRESS_CONTINUATIONS = [
  "bt", "bat", "bât", "batiment", "bloc", "n°", "porte", "appt", "app",
  "appartement", "etage", "étage", "الطابق", "عماره", "شقه", "escalier",
];

/** Delivery cues raise a wilaya mention above an incidental one. */
export const DELIVERY_CUES = [
  "livraison", "livrer", "livre", "livré", "tawsil", "twsil", "twsl", "tawssil",
  "التوصيل", "توصيل", "للتوصيل", "delivery", "deliver", "ship", "shipping",
  "wilaya", "wilayat", "ولايه", "الولايه", "a", "à", "au", "to", "pour", "vers",
  "fi", "f", "ف", "في", "men", "from", "de", "l", "ل", "lel", "habes", "sakna",
  "sakne", "saken", "ساكن", "ساكنه", "نسكن", "nskon", "j'habite", "i live in",
];

/** Words that turn a product clause into an attribute of the previous item. */
export const ATTRIBUTE_CUES = [
  "taille", "pointure", "couleur", "color", "colour", "size", "lon", "loun",
  "لون", "اللون", "مقاس", "المقاس", "القياس", "قياس", "حجم", "modele",
  "modèle", "model", "type", "version",
];

/**
 * Franco-Arab numeral decoder map
 * Used in WhatsApp/SMS where Arabic letters are written as numbers
 */
export const FRANCO_ARAB_MAP: Record<string, string> = {
  '3': 'ع', '7': 'ح', '9': 'ق', '5': 'خ', '8': 'غ', '2': 'ء',
}


/**
 * Common Darija vocabulary with French/English equivalents
 */
export const DARIJA_VOCABULARY: Record<string, string[]> = {
  // Greetings & Courtesies
  'salam': ['hello', 'bonjour'],
  'marhba': ['welcome', 'bienvenue'],
  'sahha': ['thank you', 'merci'],
  'chokran': ['thank you', 'merci'],
  'samhli': ['excuse me', 'excusez-moi'],

  // Shopping verbs & actions
  'bghit': ['I want', 'je veux'],
  'nabghi': ['I want', 'je veux'],
  'nchri': ['I buy', "j'achète"],
  'nchrilk': ['I buy for you', "je t'achète"],
  'ab3athli': ['send me', 'envoie-moi'],
  'ab3thli': ['send me', 'envoie-moi'],
  'dirli': ['make me/do for me', 'fais-moi'],
  '3tini': ['give me', 'donne-moi'],
  'warini': ['show me', 'montre-moi'],
  'zidli': ['add for me', 'ajoute-moi'],
  'nchouf': ['I see/look', 'je vois'],

  // Inquiry & Questions
  'chhal': ['how much', 'combien'],
  'ch7al': ['how much', 'combien'],
  'kayen': ['available/exists', 'disponible'],
  'ma kaynch': ['not available', 'pas disponible'],
  'makaynch': ['not available', 'pas disponible'],
  'wach kayen': ['is it available?', "c'est disponible?"],
  '3andek': ['do you have', 'tu as'],
  '3andkom': ['do you have (formal)', 'vous avez'],
  'kifach': ['how', 'comment'],
  'win': ['where', 'où'],
  'waqtach': ['when', 'quand'],
  'imta': ['when', 'quand'],
  'w3lach': ['why', 'pourquoi'],
  'mnin': ['from where', "d'où"],
  'bach': ['with what/how much', 'avec quoi/combien'],

  // State & Being
  'rani': ['I am', 'je suis'],
  'rahi': ['she is/it is', 'elle est/il est'],
  'rah': ['he is/it is', 'il est'],
  '3lbalak': ['did you know/you know', 'tu sais'],

  // Quantity & Sizing
  'chwiya': ['a little', 'un peu'],
  'bzaf': ['a lot', 'beaucoup'],
  'kbir': ['big', 'grand'],
  'sghir': ['small', 'petit'],
  'tay': ['size', 'taille'],
  'la pointure': ['shoe size', 'pointure'],

  // Numbers (Algerian prononciation)
  'wahed': ['1', 'un'],
  'zouj': ['2', 'deux'],
  'zoudj': ['2', 'deux'],
  'tletha': ['3', 'trois'],
  'rab3a': ['4', 'quatre'],
  'khamssa': ['5', 'cinq'],

  // Time & Urgency
  'lyoum': ['today', "aujourd'hui"],
  'ghudwa': ['tomorrow', 'demain'],
  'mb3d': ['later', 'après'],
  'daba': ['now', 'maintenant'],
  'bsuraa': ['urgent/fast', 'vite/urgent'],
  'belkhaf': ['fast', 'vite'],
  'mazal': ['not yet', 'pas encore'],

  // Payment
  'kach': ['cash', 'espèces'],
  'virement': ['bank transfer', 'virement'],
  'ccp': ['postal account', 'compte chèque postal'],
  'khalas': ['pay', 'payer'],
  'cbon': ['it is done/paid', "c'est bon"],

  // Confirmation & Negation
  'sah': ['correct/yes', 'oui/correct'],
  'ih': ['yes', 'oui'],
  'wah': ['yes', 'oui'],
  'la': ['no', 'non'],
  'baraka': ['enough/stop', 'assez'],
  'yezzi': ['enough', 'assez'],
  'machi': ['not/wrong', "ce n'est pas"],

  // Delivery
  'livrison': ['delivery', 'livraison'],
  'tawsil': ['delivery', 'livraison'],
  'nju': ['it arrives', 'ça arrive'],
  'yosal': ['it arrives', 'ça arrive'],
  'waslatni': ['it arrived', "c'est arrivé"],
  'livreur': ['delivery guy', 'livreur'],

  // Complaint & Issues
  'mchit': ['it broke/failed', "c'est cassé"],
  'khaser': ['broken/spoiled', 'cassé/abîmé'],
  'machi hadi': ['this is wrong', "ce n'est pas ça"],
  'nraj3': ['I return', 'je retourne'],
  'nraj3o': ['I return it', 'je le retourne'],
  'ma3jbnich': ["I don't like it", "ça me plaît pas"],
  'ghali': ['expensive', 'cher'],
  'rkhis': ['cheap', 'pas cher'],

  // E-commerce specifics
  'kamanda': ['order', 'commande'],
  'commande': ['order', 'commande'],
  'cmd': ['order', 'commande'],
  'confirmi': ['confirm', 'confirmer'],
  'confirmilha': ['confirm it', 'confirme-la'],
  'annuli': ['cancel', 'annuler'],
  'annulilha': ['cancel it', 'annule-la'],
  'retour': ['return', 'retour'],
  'raj3': ['return/send back', 'retourner'],
  'raj3atli': ['returned to me', 'retourné'],
  'sar7': ['send/ship', 'expédier'],
  'sar7li': ['ship for me', 'expédie-moi'],
  'mawaslatlich': ["it didn't arrive", "c'est pas arrivé"],
  'stock': ['stock/inventory', 'stock'],
  'khlat': ['finished/sold out', 'épuisé'],
  'mfrgha': ['empty/out of stock', 'en rupture'],
  'promotion': ['promotion/sale', 'promotion'],
  'solde': ['sale/discount', 'solde'],
  'tkhfid': ['discount', 'réduction'],
  'benefice': ['profit', 'bénéfice'],
  'rab7': ['profit/gain', 'bénéfice'],
  'khasara': ['loss', 'perte'],
  
  // WhatsApp/confirmation patterns
  'weslat': ['it arrived', "c'est arrivé"],
  'nediha': ['I take it', 'je la prends'],
  'nedih': ['I take it', 'je le prends'],
  'manbghihach': ["I don't want it", 'je ne le veux pas'],
  'rabi ysahel': ['God make it easy', 'que Dieu facilite'],
  'inchallah': ['God willing', 'si Dieu le veut'],
  'ya3tik sahha': ['thank you (lit. may God give you health)', 'merci'],

  // Negotiation
  'n9os': ['reduce/lower', 'réduire'],
  'n9osli': ['lower for me', 'réduis-moi'],
  'dernier prix': ['final price', 'dernier prix'],
  'prix final': ['final price', 'prix final'],
  'nhar7mli': ['give me a deal', 'fais-moi un prix'],
}

/**
 * Darija/Slang product category keywords → French normalized names
 */
export const DARIJA_PRODUCT_KEYWORDS: Record<string, string> = {
  '3itr': 'parfum', 'عطر': 'parfum', 'ريحة': 'parfum',
  'كريم': 'crème', 'crem': 'crème', 'cream': 'crème',
  'sa3a': 'montre', 'ساعة': 'montre', 'magana': 'montre',
  'حقيبة': 'sac', 'sacoche': 'sac', 'sakoch': 'sac', 'sac': 'sac',
  'tshirt': 't-shirt', 'تريكو': 't-shirt', 'triko': 't-shirt', 'polo': 't-shirt',
  'حذاء': 'chaussure', 'sbat': 'chaussure', 'sbbat': 'chaussure', 'baskit': 'basket',
  'سروال': 'pantalon', 'srwal': 'pantalon', 'sarwal': 'pantalon', 'jeans': 'jean',
  'روبة': 'robe', 'roba': 'robe',
  'زيت': 'huile', 'zit': 'huile',
  'كتاب': 'livre', 'ktab': 'livre',
  'سماعات': 'écouteurs', 'oreillette': 'écouteurs', 'kit': 'écouteurs',
  'هاتف': 'téléphone', 'portable': 'téléphone', 'tilifon': 'téléphone',
  'tracki': 'survêtement', 'survet': 'survêtement',
  'chargeur': 'chargeur', 'charjor': 'chargeur',
  'coque': 'coque', 'pochel': 'coque', // pochette
  'kaba': 'manteau', 'veste': 'veste', // kaba can also be a bag, context dependent
  'lunette': 'lunettes', 'ndader': 'lunettes',
  // Cosmetics & beauty
  'maquillage': 'maquillage', 'makiyaj': 'maquillage',
  'rouge à lèvres': 'rouge à lèvres', 'rouge': 'rouge à lèvres',
  'fond de teint': 'fond de teint', 'fonditin': 'fond de teint',
  'mascara': 'mascara', 'maskara': 'mascara',
  // Electronics
  'pc': 'ordinateur', 'laptop': 'ordinateur portable',
  'tablette': 'tablette', 'tablit': 'tablette',
  'souris': 'souris', 'mouse': 'souris',
  'clavier': 'clavier', 'clavyi': 'clavier',
  'camera': 'caméra', 'kamira': 'caméra',
  // Home & kitchen
  'cuisine': 'cuisine', 'kwizin': 'cuisine',
  'matla3': 'matelas', 'matelas': 'matelas',
  'couverture': 'couverture', 'kowvirtur': 'couverture',
  'coussin': 'coussin', 'kosin': 'coussin',
  // Jewelry & accessories
  'bijoux': 'bijoux', 'bijou': 'bijoux',
  'خاتم': 'bague', 'khatim': 'bague', 'bague': 'bague',
  'سلسلة': 'chaîne', 'silsla': 'chaîne',
  'سوارة': 'bracelet', 'swara': 'bracelet',
}

/**
 * Wilaya abbreviations and informal names → official name
 */
export const WILAYA_SHORTCUTS: Record<string, string> = {
  'to': 'Tizi Ouzou', 'tizi': 'Tizi Ouzou',
  'bba': 'Bordj Bou Arréridj', 'bordj': 'Bordj Bou Arréridj',
  'sba': 'Sidi Bel Abbès',
  'oeb': 'Oum El Bouaghi', 'tam': 'Tamanrasset', 'hmd': 'Hassi Messaoud',
  'dzr': 'Alger', 'alg': 'Alger', 'el-bahdja': 'Alger', 'alger': 'Alger',
  'cne': 'Constantine', 'cirta': 'Constantine', 'la ville des ponts': 'Constantine',
  'oran': 'Oran', 'el-bahia': 'Oran', 'wahran': 'Oran',
  'annaba': 'Annaba', 'bone': 'Annaba',
  'bejaia': 'Béjaïa', 'bgayet': 'Béjaïa',
  'blida': 'Blida', 'ville des roses': 'Blida',
  'tlm': 'Tlemcen',
}

/**
 * Returns the full system prompt fragment for Algerian language understanding
 * Inject this into any LLM system prompt
 */
export function getAlgerianLanguagePrompt(): string {
  return `
ALGERIAN LANGUAGE UNDERSTANDING (INPUT COMPREHENSION ONLY):
You MUST understand ALL of the following input formats — but your RESPONSE language is determined ONLY by the language instruction above. NEVER respond in Darija or dialect.

INPUT FORMATS YOU MUST UNDERSTAND:
1. Darija (Algerian Arabic dialect) in Arabic script
2. Franco-Arab: Darija written in Latin letters with numbers replacing Arabic letters (3=ع, 7=ح, 9=ق, 5=خ, 8=غ, 2=ء)
3. French
4. English
5. A mix of all the above in one sentence (code-switching)

COMMON DARIJA PATTERNS (FOR COMPREHENSION):
- "bghit" = I want, "chhal" = how much, "kayen" = available, "3andek" = do you have
- "ab3athli" = send me, "warini" = show me, "dirli" = do for me
- "wach kayen le parfum?" = is the perfume available?
- "bghit zouj w la crème aussi" = I want 2 and the cream too
- "livrison l'oran" = delivery to Oran
- "kash", "ccp", "virement" = payment methods
- "lyoum", "ghudwa", "bsuraa" = time/urgency

PRODUCT KEYWORDS & SLANG (FOR COMPREHENSION):
- 3itr/عطر/ريحة = parfum, كريم/crem = crème, sa3a/magana = montre
- sacoche/حقيبة = sac, tshirt/تريكو/triko = t-shirt, sbat/baskit = chaussure
- srwal/jeans = pantalon, tracki/survet = survêtement, ndader = lunettes

WILAYA SHORTCUTS (FOR COMPREHENSION):
- TO/tizi = Tizi Ouzou, BBA/bordj = Bordj Bou Arréridj, SBA = Sidi Bel Abbès
- DZR/ALG/el-bahdja = Alger, cirta = Constantine, el-bahia/wahran = Oran, bgayet = Béjaïa

CRITICAL RULE: You must UNDERSTAND all input languages above, but you must ALWAYS respond in the language specified by the language instruction. NEVER respond in Darija or dialect.
`.trim()
}

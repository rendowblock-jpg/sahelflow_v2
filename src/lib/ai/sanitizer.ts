/**
 * SahelFlow AI Post-Hoc Language Sanitizer
 * Phase 60A: Guards against Darija/dialect leaking into AI responses.
 *
 * Even with strong prompt engineering, LLMs occasionally slip Darija words
 * into their responses when the input is in Darija. This module provides
 * a lightweight post-processing pass to catch and replace common leaks.
 */

/**
 * Common Darija words that should NEVER appear in a formal AI response.
 * Maps Darija → { ar, fr, en } replacements per locale.
 */
const DARIJA_LEAK_MAP: Record<string, { ar: string; fr: string; en: string }> = {
  // Greetings
  'صحا': { ar: 'شكراً', fr: 'merci', en: 'thank you' },
  'لاباس': { ar: 'بخير', fr: 'bien', en: 'fine' },
  'واش': { ar: 'هل', fr: 'est-ce que', en: 'is/does' },
  'كيفاش': { ar: 'كيف', fr: 'comment', en: 'how' },
  'بغيت': { ar: 'أريد', fr: 'je veux', en: 'I want' },
  'عندك': { ar: 'لديك', fr: 'tu as', en: 'you have' },
  'كاين': { ar: 'متوفر', fr: 'disponible', en: 'available' },
  'ماكانش': { ar: 'غير متوفر', fr: 'pas disponible', en: 'not available' },
  'شحال': { ar: 'كم', fr: 'combien', en: 'how much' },
  'بزاف': { ar: 'كثيراً', fr: 'beaucoup', en: 'a lot' },
  'شوية': { ar: 'قليلاً', fr: 'un peu', en: 'a little' },
  'ديرلي': { ar: 'أنجز لي', fr: 'fais-moi', en: 'do for me' },
  'عطيني': { ar: 'أعطني', fr: 'donne-moi', en: 'give me' },
  'وريني': { ar: 'أرني', fr: 'montre-moi', en: 'show me' },
  'ليفريزون': { ar: 'التوصيل', fr: 'la livraison', en: 'delivery' },
  'خويا': { ar: 'أخي', fr: 'mon frère', en: 'brother' },
  'ختي': { ar: 'أختي', fr: 'ma sœur', en: 'sister' },
  'صاحبي': { ar: 'صديقي', fr: 'mon ami', en: 'my friend' },
  'مازال': { ar: 'لم يتم بعد', fr: 'pas encore', en: 'not yet' },
  'دابا': { ar: 'الآن', fr: 'maintenant', en: 'now' },
  'غدوة': { ar: 'غداً', fr: 'demain', en: 'tomorrow' },
  'اليوم': { ar: 'اليوم', fr: "aujourd'hui", en: 'today' },
  'بصراحة': { ar: 'بصراحة', fr: 'franchement', en: 'honestly' },
  'نشالله': { ar: 'إن شاء الله', fr: 'si Dieu le veut', en: 'God willing' },
  'الحمدولله': { ar: 'الحمد لله', fr: 'Dieu merci', en: 'thank God' },
}

/**
 * Sanitize an AI response to remove Darija leaks.
 * Only runs a replace pass when the locale is NOT `ar` (since some Darija words
 * overlap with valid MSA Arabic — the `ar` locale relies on prompt engineering).
 *
 * @param text - The raw AI response
 * @param locale - The system's active locale ('ar' | 'fr' | 'en')
 * @returns The sanitized text
 */
export function sanitizeDarijaLeaks(text: string, locale: 'ar' | 'fr' | 'en'): string {
  if (!text) return text
  // Arabic locale: skip sanitization - Darija words overlap with valid MSA Arabic
  // Arabic responses rely on prompt engineering instead
  if (locale === 'ar') return text

  let result = text
  for (const [darija, replacements] of Object.entries(DARIJA_LEAK_MAP)) {
    // Use word-boundary-aware replacement to avoid partial word matches
    const regex = new RegExp('(?<=^|\\s)' + darija + '(?=$|\\s|[,.;!?])', 'gu')
    const replacement = replacements[locale] || replacements.en
    result = result.replace(regex, replacement)
  }
  return result
}
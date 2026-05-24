/**
 * Server-only DeepL text translation helper.
 *
 * Translates short item descriptions to English for better category matching.
 * Uses DeepL's TEXT translation endpoint — never document translation.
 *
 * If DEEPL_API_KEY is not set, returns an empty map and the app works normally.
 * If the API call fails, errors are logged and an empty map is returned — the
 * review flow is never blocked by a translation failure.
 */

const MAX_CHARS_PER_BATCH = 10_000
const MIN_DESC_LENGTH = 3

// Czech (and Slovak/Polish) diacritics that signal non-English text.
const DIACRITIC_RE = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/

/** Returns true if the text is almost certainly already English (or irrelevant). */
function looksEnglish(text: string): boolean {
  return !DIACRITIC_RE.test(text)
}

/**
 * Batch-translate an array of item description strings to English.
 *
 * - Deduplicates identical strings before sending.
 * - Skips strings that already look English.
 * - Respects a 10,000-character cap per call.
 * - Never blocks on failure — returns an empty map instead.
 *
 * @returns Map from original text → English translation.
 *          Strings with no translation (already English, skipped, or failed) are absent.
 */
export async function translateTextsToEnglish(
  texts: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  const apiKey = process.env.DEEPL_API_KEY
  if (!apiKey) return result

  // Deduplicate, filter too-short and already-English strings.
  const unique = [...new Set(texts)].filter(
    (t) => t.length >= MIN_DESC_LENGTH && !looksEnglish(t)
  )
  if (unique.length === 0) return result

  // Respect per-batch character cap; take as many as fit.
  let totalChars = 0
  const toTranslate: string[] = []
  for (const t of unique) {
    if (totalChars + t.length > MAX_CHARS_PER_BATCH) break
    toTranslate.push(t)
    totalChars += t.length
  }

  // Free-tier keys end with ':fx'; paid keys use the main endpoint.
  const baseUrl = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2'
    : 'https://api.deepl.com/v2'

  try {
    // DeepL text API accepts application/x-www-form-urlencoded with repeated 'text' params.
    const body = new URLSearchParams()
    body.append('target_lang', 'EN')
    for (const t of toTranslate) body.append('text', t)

    const response = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.warn('[DeepL] translation request failed:', response.status, errBody.slice(0, 200))
      return result
    }

    const data = (await response.json()) as {
      translations: Array<{ detected_source_language: string; text: string }>
    }

    for (let i = 0; i < toTranslate.length; i++) {
      const translated = data.translations[i]?.text
      if (translated && translated !== toTranslate[i]) {
        result.set(toTranslate[i], translated)
      }
    }

    console.log(
      `[DeepL] translated ${result.size}/${toTranslate.length} items` +
        ` (${totalChars} chars, skipped ${unique.length - toTranslate.length} over cap)`
    )
  } catch (err) {
    console.warn('[DeepL] request threw:', err instanceof Error ? err.message : String(err))
  }

  return result
}

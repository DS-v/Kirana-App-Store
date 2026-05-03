/**
 * ocr.js — Tesseract.js wrapper for in-browser OCR.
 *
 * Language strategy
 * ─────────────────
 * 'eng'      — Latin-script text: Hinglish ("do Maggi 14"), English, printed labels.
 *              Fast (~5 MB data download on first use, cached in IndexedDB after).
 * 'hin'      — Devanagari script: handwritten Hindi order slips (₹, numbers, names).
 *              Adds ~10 MB. Loaded only when caller passes lang='hin+eng'.
 *
 * For most kirana use-cases (WhatsApp screenshots, typed orders, printed price lists)
 * 'eng' is sufficient since customers write in Hinglish (Latin script even if Hindi words).
 * Use 'hin+eng' when the shopkeeper photographs a handwritten Devanagari slip.
 *
 * onProgress(pct: 0-100) — called during recognition phase.
 * Returns: raw text string extracted from the image.
 */
export async function runOCR(imageSource, { lang = 'eng', onProgress } = {}) {
  const { createWorker } = await import('tesseract.js')

  const worker = await createWorker(lang.split('+'), 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        onProgress?.(Math.round(m.progress * 100))
      }
    },
    // Keep language data in IndexedDB so it's only downloaded once
    cacheMethod: 'write',
  })

  const { data } = await worker.recognize(imageSource)
  await worker.terminate()

  return data.text.trim()
}

/**
 * Quick heuristic: does the extracted text look like a product/order list?
 * Used to surface a warning when OCR yields mostly garbage.
 */
export function looksLikeOrderText(text) {
  if (!text || text.length < 10) return false
  // Must have at least one digit (quantity or price)
  if (!/\d/.test(text)) return false
  // Must have at least a couple of word characters
  if ((text.match(/\w/g) || []).length < 6) return false
  return true
}

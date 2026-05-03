// Parses free-form WhatsApp/SMS order messages into structured line items.
// Handles Hindi, English, Hinglish (Devanagari + Latin script).
// Used as client-side fallback when the LLM backend is unavailable.

// ── Unit aliases ───────────────────────────────────────────────────────────────
const UNIT_ALIASES = {
  // Latin + common abbreviations
  'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'g': 'g', 'gram': 'g', 'gm': 'g', 'grams': 'g', 'gms': 'g',
  'l': 'litre', 'ltr': 'litre', 'litre': 'litre', 'liter': 'litre',
  'litres': 'litre', 'liters': 'litre', 'lt': 'litre',
  'ml': 'ml',
  'pc': 'pc', 'pcs': 'pc', 'piece': 'pc', 'pieces': 'pc', 'nos': 'pc', 'no': 'pc',
  'pkt': 'packet', 'packet': 'packet', 'pack': 'packet', 'pkts': 'packet', 'packs': 'packet',
  'box': 'box', 'dozen': 'dozen', 'doz': 'dozen', 'bar': 'bar',
  'bottle': 'bottle', 'botal': 'bottle', 'botol': 'bottle',
  'sachet': 'sachet', 'strip': 'strip', 'pouch': 'pouch',
  // Hinglish romanised
  'kilo': 'kg', 'paav': '0.25kg', 'adha': '0.5',
  'botal': 'bottle', 'theli': 'packet', 'thaili': 'packet',
  // Devanagari
  'किलो': 'kg', 'किलोग्राम': 'kg',
  'ग्राम': 'g', 'ग्रा': 'g',
  'लीटर': 'litre', 'लिटर': 'litre',
  'मिली': 'ml', 'मिलीलीटर': 'ml',
  'पैकेट': 'packet', 'पेकेट': 'packet', 'पैक': 'packet',
  'बोतल': 'bottle', 'थैली': 'packet', 'थैला': 'packet',
  'पीस': 'pc', 'नग': 'pc',
}

// ── Number words ───────────────────────────────────────────────────────────────
const NUMBER_WORDS = {
  // English
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'half': 0.5, 'quarter': 0.25,
  // Hinglish romanised
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
  'chhe': 6, 'che': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
  'gyarah': 11, 'barah': 12, 'aadhaa': 0.5, 'aadha': 0.5,
  // Devanagari
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5,
  'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'ग्यारह': 11, 'बारह': 12, 'आधा': 0.5,
}

// ── Noise / heading patterns to skip ──────────────────────────────────────────
const SKIP_LINE = /^(s\.?no|sr|sl|#|total|grand|page|date|invoice|bill|gst|hsn|thank|regards|hi|hello|jai|ram|bhai|didi|ji\b)/i

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalise(str) {
  // Preserve Devanagari (ऀ-ॿ range); remove hyphens; collapse whitespace
  return str
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/[^\w\sऀ-ॿ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseQuantity(token) {
  if (!token) return null
  const n = parseFloat(token)
  if (!isNaN(n) && n > 0) return n
  return NUMBER_WORDS[token.toLowerCase()] ?? NUMBER_WORDS[token] ?? null
}

function splitLines(text) {
  // Split on newlines, commas, semicolons; also split "2 Maggi 1 Parle-G" into separate items
  return text.split(/[\n,;]+/).map(l => l.trim()).filter(l => l.length > 1)
}

// ── Product matching — 4 tiers ────────────────────────────────────────────────

const MIN_PARTIAL_LEN = 3   // tokens shorter than this won't trigger partial match (avoids "do"→"Doodh")

function matchProduct(token, products) {
  const t = normalise(token)
  if (!t) return null

  // Tier 1: exact name
  let m = products.find(p => normalise(p.name) === t)
  if (m) return m

  // Tier 2: exact alias
  m = products.find(p => (p.aliases || []).some(a => normalise(a) === t))
  if (m) return m

  // Tier 3: partial name — require meaningful length to avoid short-word false positives
  if (t.length >= MIN_PARTIAL_LEN) {
    m = products.find(p => {
      const pn = normalise(p.name)
      return pn.includes(t) || (t.length >= 4 && t.includes(pn.split(' ')[0]))
    })
    if (m) return m
  }

  // Tier 4: partial alias — same length guard
  if (t.length >= MIN_PARTIAL_LEN) {
    m = products.find(p =>
      (p.aliases || []).some(a => {
        const na = normalise(a)
        return na.includes(t) || (t.length >= 4 && t.includes(na))
      })
    )
    if (m) return m
  }

  return null
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOrderMessage(text, products = []) {
  const lines = splitLines(text)
  const items = []
  const unrecognised = []

  for (const line of lines) {
    if (!line || line.length < 2) continue
    if (SKIP_LINE.test(line.trim())) continue

    const tokens = normalise(line).split(/\s+/)

    // Separate name-candidate tokens from quantity/unit tokens
    const nameTokens = tokens.filter(t => parseQuantity(t) === null && !UNIT_ALIASES[t] && !UNIT_ALIASES[t.toLowerCase()])
    const numTokens  = tokens.filter(t => parseQuantity(t) !== null || UNIT_ALIASES[t] || UNIT_ALIASES[t.toLowerCase()])

    let qty     = null
    let unit    = null
    let matched = null

    // Sliding window over name tokens (longest → shortest)
    outer:
    for (let len = nameTokens.length; len >= 1; len--) {
      for (let start = 0; start <= nameTokens.length - len; start++) {
        const candidate = nameTokens.slice(start, start + len).join(' ')
        const p = matchProduct(candidate, products)
        if (p) {
          matched = p
          // pick qty & unit from leftover numeric tokens
          for (const tok of numTokens) {
            const unitKey = UNIT_ALIASES[tok] || UNIT_ALIASES[tok.toLowerCase()]
            if (unitKey && !unit) { unit = unitKey; continue }
            const q = parseQuantity(tok)
            if (q !== null && qty === null) qty = q
          }
          break outer
        }
      }
    }

    if (matched) {
      items.push({
        productId:    matched.id,
        productName:  matched.name,
        qty:          qty ?? 1,
        unit:         unit ?? matched.unit ?? 'pc',
        price:        matched.price,
        inStock:      matched.inStock,
        originalLine: line,
      })
    } else {
      // No product matched — keep raw line for manual review
      const q = numTokens.length ? parseQuantity(numTokens[0]) : null
      unrecognised.push({ originalLine: line, qty: q ?? 1 })
    }
  }

  return { items, unrecognised }
}

export function orderTotal(items) {
  return items.reduce((sum, i) => sum + (i.price ?? 0) * (i.qty ?? 1), 0)
}

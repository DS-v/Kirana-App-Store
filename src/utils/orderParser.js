// Parses free-form WhatsApp/SMS order messages into structured line items.
// Handles Hindi, English, Hinglish, and common kirana abbreviations.

const UNIT_ALIASES = {
  'kg': 'kg', 'kilo': 'kg', 'किलो': 'kg',
  'g': 'g', 'gram': 'g', 'gm': 'g', 'ग्राम': 'g',
  'l': 'l', 'ltr': 'l', 'litre': 'l', 'liter': 'l', 'लीटर': 'l',
  'ml': 'ml',
  'pc': 'pc', 'pcs': 'pc', 'piece': 'pc', 'pieces': 'pc', 'nos': 'pc',
  'pkt': 'packet', 'packet': 'packet', 'pack': 'packet', 'पैकेट': 'packet',
  'dozen': 'dozen', 'doz': 'dozen',
  'half': '0.5',
  'सौ': '100', 'दो': '2', 'तीन': '3', 'चार': '4', 'पाँच': '5',
}

const NUMBER_WORDS = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
  'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
  'half': 0.5,
}

function normalise(str) {
  // Remove hyphens (Parle-G → parleg) then strip other non-word chars
  return str.toLowerCase().replace(/-/g, '').replace(/[^\w\sऀ-ॿ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseQuantity(token) {
  if (!token) return null
  const n = parseFloat(token)
  if (!isNaN(n)) return n
  return NUMBER_WORDS[token.toLowerCase()] ?? null
}

// Split a message into candidate lines (handles newlines, commas, semicolons)
function splitLines(text) {
  return text.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean)
}

// Try to match a product from the catalog using name/alias fuzzy search
function matchProduct(token, products) {
  const t = normalise(token)
  // exact name match
  let match = products.find(p => normalise(p.name) === t)
  if (match) return match
  // alias match
  match = products.find(p => (p.aliases || []).some(a => normalise(a) === t))
  if (match) return match
  // partial name match
  match = products.find(p => normalise(p.name).includes(t) || t.includes(normalise(p.name).split(' ')[0]))
  if (match) return match
  // partial alias match
  match = products.find(p => (p.aliases || []).some(a => normalise(a).includes(t) || t.includes(normalise(a))))
  return match ?? null
}

export function parseOrderMessage(text, products = []) {
  const lines = splitLines(text)
  const items = []
  const unrecognised = []

  for (const line of lines) {
    if (!line || line.length < 2) continue
    const tokens = normalise(line).split(/\s+/)

    let qty = null
    let unit = null
    let productTokens = []
    let matched = null

    // Strategy: slide a window over tokens trying to match product first,
    // then pick up quantity/unit from the remaining tokens.
    // Only use non-numeric tokens as product name candidates
  const nameTokens = tokens.filter(t => parseQuantity(t) === null && !UNIT_ALIASES[t])
  const numTokens  = tokens.filter(t => parseQuantity(t) !== null || UNIT_ALIASES[t])

  for (let len = nameTokens.length; len >= 1; len--) {
      for (let start = 0; start <= nameTokens.length - len; start++) {
        const candidate = nameTokens.slice(start, start + len).join(' ')
        const p = matchProduct(candidate, products)
        if (p) {
          matched = p
          // parse qty & unit from the leftover numeric tokens
          for (const tok of numTokens) {
            const unitKey = UNIT_ALIASES[tok]
            if (unitKey && !unit) { unit = unitKey; continue }
            const q = parseQuantity(tok)
            if (q !== null && qty === null) qty = q
          }
          break
        }
      }
      if (matched) break
    }

    if (matched) {
      items.push({
        productId: matched.id,
        productName: matched.name,
        qty: qty ?? 1,
        unit: unit ?? matched.unit ?? 'pc',
        price: matched.price,
        inStock: matched.inStock,
        originalLine: line,
      })
    } else {
      // No product matched – keep it for manual review
      const qtyGuess = parseQuantity(tokens[0]) ? parseQuantity(tokens[0]) : 1
      unrecognised.push({ originalLine: line, qty: qtyGuess })
    }
  }

  return { items, unrecognised }
}

export function orderTotal(items) {
  return items.reduce((sum, i) => sum + (i.price ?? 0) * (i.qty ?? 1), 0)
}

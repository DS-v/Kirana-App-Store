/**
 * fileImport.js
 *
 * Parses uploaded files (Excel, CSV, PDF, DOCX, TXT) into a list of
 * candidate product rows: { name, price, unit, category }.
 *
 * Strategy per format
 * ───────────────────
 * Excel / CSV  — read via SheetJS; smart header detection to find name + price columns.
 *                Falls back to "first text col = name, first numeric col = price".
 * PDF          — extract text via pdfjs-dist (worker loaded from CDN); then parse
 *                each line with the same regex used by the paste-import feature.
 * DOCX         — extract plain text via mammoth; same line parser.
 * TXT          — read as plain text; same line parser.
 *
 * All parsers return: Array<{ name, price, unit, category }>
 */

// ── helpers ───────────────────────────────────────────────────────────────────

const CATEGORIES = ['Staples', 'Dairy', 'Biscuits', 'Snacks', 'Noodles', 'Beverages', 'Household', 'Other']

const CATEGORY_KEYWORDS = {
  Dairy:      ['milk', 'curd', 'butter', 'paneer', 'ghee', 'cheese', 'cream', 'lassi', 'amul', 'dahi'],
  Staples:    ['atta', 'flour', 'rice', 'dal', 'salt', 'sugar', 'oil', 'rava', 'maida', 'besan', 'poha', 'suji'],
  Biscuits:   ['biscuit', 'parle', 'marie', 'bourbon', 'oreo', 'digestive', 'crackers', 'cookie'],
  Noodles:    ['maggi', 'noodle', 'pasta', 'atta noodle', 'yippee', 'top ramen'],
  Snacks:     ['chips', 'lays', 'kurkure', 'namkeen', 'bhujia', 'popcorn', 'nachos', 'peanut', 'mixture'],
  Beverages:  ['tea', 'coffee', 'juice', 'drink', 'cold drink', 'pepsi', 'coke', 'sprite', 'chai', 'horlicks', 'boost', 'complan', 'bournvita'],
  Household:  ['soap', 'detergent', 'surf', 'vim', 'phenyl', 'broom', 'bucket', 'mop', 'rin', 'ariel', 'harpic', 'sanitizer', 'dettol', 'lizol'],
}

function guessCategory(name) {
  const n = name.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => n.includes(k))) return cat
  }
  return 'Other'
}

const UNIT_MAP = {
  kg: 'kg', kgs: 'kg', kilogram: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'litre', ltr: 'litre', litre: 'litre', liter: 'litre', liters: 'litre', litres: 'litre',
  ml: 'ml',
  pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', nos: 'pc', no: 'pc',
  pkt: 'packet', packet: 'packet', pack: 'packet', pkts: 'packet', packs: 'packet',
  box: 'box', dozen: 'dozen', doz: 'dozen', bar: 'bar',
}

function guessUnit(text) {
  const t = text.toLowerCase()
  for (const [k, v] of Object.entries(UNIT_MAP)) {
    // match as whole word
    if (new RegExp(`\\b${k}\\b`).test(t)) return v
  }
  return 'packet'
}

/**
 * Parse free-form text lines into product rows.
 * Handles: "Parle-G 10", "Maggi 14 rs", "Amul Milk 1ltr 28"
 * Size suffixes like "500g", "1kg", "200ml" are detected as part of the
 * product name / unit — NOT mistaken for prices.
 */

// Matches a size/quantity suffix that should stay with the product name
const SIZE_SUFFIX = /\b(\d+(?:\.\d+)?)\s*(g|gm|gms|kg|kgs|ml|l|ltr|litre|liters?|litres?|pc|pcs|nos)\b/gi

function parseLinesAsProducts(lines) {
  const rows = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.length < 2) continue
    // Skip obvious headings / totals / page numbers
    if (/^(s\.?no|sr|sl|#|total|grand|page|date|invoice|bill|gst|hsn|thank|regards)/i.test(line)) continue
    if (/^\d+$/.test(line)) continue   // just a bare number

    // Strip size suffixes first so they don't get treated as prices
    const withoutSize = line.replace(SIZE_SUFFIX, (_, num, u) => {
      // keep the unit word in the name string so guessUnit() works
      return ` _size_${u} `
    })

    // Prefer explicit ₹/rs price; otherwise use LAST standalone number
    let price = 0
    let nameStr = line

    const explicitPrice = withoutSize.match(/(?:₹|rs\.?\s*)(\d+(?:\.\d{1,2})?)/i)
    if (explicitPrice) {
      price   = parseFloat(explicitPrice[1])
      nameStr = withoutSize.replace(explicitPrice[0], '').trim()
    } else {
      // Last number in the stripped string (likely the price column)
      const lastNum = withoutSize.match(/(\d+(?:\.\d{1,2})?)(?=[^0-9]*$)/)
      if (lastNum) {
        price   = parseFloat(lastNum[1])
        nameStr = withoutSize.slice(0, lastNum.index).trim()
      }
    }

    // Clean name (remove leftover numbers, punctuation; restore size tokens)
    const name = nameStr
      .replace(/_size_\w+/g, '')          // remove our temporary markers
      .replace(/\d+(?:\.\d+)?\s*(rs|₹|inr|rupees?)?/gi, '')
      .replace(/[|•\-–—*#]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (name.length < 2) continue
    if (/^[\d\s.,-]+$/.test(name)) continue   // name is all numbers — skip

    rows.push({
      name,
      price,
      unit:     guessUnit(line),   // original line still has the unit suffix
      category: guessCategory(name),
    })
  }
  return rows
}

// ── Column name recognition for Excel ────────────────────────────────────────

const NAME_HEADERS  = ['name', 'product', 'item', 'description', 'product name', 'item name', 'particulars', 'goods', 'article']
const PRICE_HEADERS = ['price', 'rate', 'mrp', 'cost', 'amount', 'selling price', 'sp', 'unit price', 'sale price', 'sell price']
const UNIT_HEADERS  = ['unit', 'uom', 'measure', 'qty unit', 'pack']
const CAT_HEADERS   = ['category', 'type', 'group', 'dept', 'department', 'section']

function matchHeader(cell, targets) {
  if (!cell) return false
  const v = String(cell).toLowerCase().trim()
  return targets.some(t => v.includes(t))
}

function detectColumns(headerRow) {
  const cols = { name: -1, price: -1, unit: -1, category: -1 }
  headerRow.forEach((cell, i) => {
    if (cols.name     < 0 && matchHeader(cell, NAME_HEADERS))  cols.name     = i
    if (cols.price    < 0 && matchHeader(cell, PRICE_HEADERS)) cols.price    = i
    if (cols.unit     < 0 && matchHeader(cell, UNIT_HEADERS))  cols.unit     = i
    if (cols.category < 0 && matchHeader(cell, CAT_HEADERS))   cols.category = i
  })
  return cols
}

// ── Excel / CSV parser ────────────────────────────────────────────────────────

export async function parseExcel(file) {
  const { read, utils } = await import('xlsx')
  const buffer   = await file.arrayBuffer()
  const workbook = read(buffer, { type: 'array' })

  // Use the first non-empty sheet
  const sheetName = workbook.SheetNames[0]
  const sheet     = workbook.Sheets[sheetName]
  const rows      = utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (!rows.length) return []

  // Find the header row (first row with >2 non-empty cells)
  let headerIdx = 0
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break }
  }
  const header = rows[headerIdx].map(c => String(c))
  const cols   = detectColumns(header)

  // If no name column found, fall back: col 0 = name, first numeric col = price
  if (cols.name < 0) cols.name = 0
  if (cols.price < 0) {
    // find first column with numeric data in the first data row
    const firstData = rows[headerIdx + 1] || []
    for (let i = 0; i < firstData.length; i++) {
      if (i !== cols.name && !isNaN(parseFloat(firstData[i])) && firstData[i] !== '') {
        cols.price = i; break
      }
    }
  }

  const products = []
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row  = rows[r]
    const name = String(row[cols.name] ?? '').trim()
    if (!name || name.length < 2) continue

    const priceRaw = cols.price >= 0 ? row[cols.price] : ''
    const price    = parseFloat(String(priceRaw).replace(/[^\d.]/g, '')) || 0

    const unitRaw  = cols.unit >= 0 ? String(row[cols.unit] ?? '') : ''
    const unit     = UNIT_MAP[unitRaw.toLowerCase().trim()] || guessUnit(name) || 'packet'

    const catRaw   = cols.category >= 0 ? String(row[cols.category] ?? '') : ''
    const category = CATEGORIES.includes(catRaw) ? catRaw : guessCategory(name)

    products.push({ name, price, unit, category })
  }

  return products
}

// ── PDF parser ────────────────────────────────────────────────────────────────

export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist')
  // Use the local worker bundled with pdfjs-dist — always version-matched,
  // no CDN dependency, works offline. Vite's ?url suffix gives us the asset URL.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href

  const buffer    = await file.arrayBuffer()
  const pdf       = await pdfjsLib.getDocument({ data: buffer }).promise
  const textLines = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p)
    const content = await page.getTextContent()
    // Group items by y-position (same line) then sort by x
    const byY = {}
    for (const item of content.items) {
      const y = Math.round(item.transform[5])
      if (!byY[y]) byY[y] = []
      byY[y].push(item)
    }
    const sortedYs = Object.keys(byY).map(Number).sort((a, b) => b - a)
    for (const y of sortedYs) {
      const line = byY[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim()
      if (line) textLines.push(line)
    }
  }

  return parseLinesAsProducts(textLines)
}

// ── DOCX parser ───────────────────────────────────────────────────────────────

export async function parseDOCX(file) {
  const mammoth   = await import('mammoth')
  const buffer    = await file.arrayBuffer()
  const result    = await mammoth.extractRawText({ arrayBuffer: buffer })
  const lines     = result.value.split('\n')
  return parseLinesAsProducts(lines)
}

// ── Plain text ────────────────────────────────────────────────────────────────

export async function parseTXT(file) {
  const text  = await file.text()
  const lines = text.split(/\r?\n/)
  return parseLinesAsProducts(lines)
}

// ── Image parser (OCR via Tesseract.js) ──────────────────────────────────────

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'tif']

export async function parseImage(file, { lang = 'eng', onProgress } = {}) {
  const { runOCR } = await import('./ocr.js')
  const text = await runOCR(file, { lang, onProgress })
  const lines = text.split(/\r?\n/)
  return parseLinesAsProducts(lines)
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function parseFile(file, options = {}) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return parseExcel(file)
  if (ext === 'pdf')                                 return parsePDF(file)
  if (ext === 'docx')                                return parseDOCX(file)
  if (['txt', 'tsv'].includes(ext))                  return parseTXT(file)
  if (IMAGE_EXTS.includes(ext))                      return parseImage(file, options)

  // DOC (legacy binary) — not supported on frontend, suggest DOCX
  if (ext === 'doc') throw new Error('Legacy .doc format is not supported. Please save the file as .docx and try again.')

  throw new Error(`Unsupported file type: .${ext}`)
}

export { CATEGORIES, IMAGE_EXTS }

/**
 * fileImport.js
 *
 * Content extraction helpers for catalog import.
 *
 * Strategy per format
 * ───────────────────
 * Excel / CSV  — parsed entirely by SheetJS with smart header detection.
 *                Returns product rows directly — no AI needed for tabular data.
 * PDF          — text extracted by pdfjs-dist (local worker).
 * DOCX         — text extracted by mammoth.
 * TXT          — file.text()
 * Image        — compressed to ≤1024px JPEG, returned as base64.
 *
 * PDF/DOCX/TXT/Image text/data is handed to FileImportModal which calls the
 * /api/llm/parse-catalog endpoint for semantic product extraction.
 *
 * All parsers return one of:
 *   { type: 'products', data: Array<{name,price,unit,category}> }   ← Excel
 *   { type: 'text',     data: string }                              ← PDF/DOCX/TXT
 *   { type: 'image',    data: {imageBase64,mimeType,dataUrl} }      ← images
 */

export const CATEGORIES = ['Staples', 'Dairy', 'Biscuits', 'Snacks', 'Noodles', 'Beverages', 'Household', 'Other']
export const IMAGE_EXTS  = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'tif']

// ── Excel helpers (still used directly) ──────────────────────────────────────

const UNIT_MAP = {
  kg: 'kg', kgs: 'kg', kilogram: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'litre', ltr: 'litre', litre: 'litre', liter: 'litre', liters: 'litre', litres: 'litre',
  ml: 'ml',
  pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', nos: 'pc', no: 'pc',
  pkt: 'packet', packet: 'packet', pack: 'packet', pkts: 'packet', packs: 'packet',
  box: 'box', dozen: 'dozen', doz: 'dozen', bar: 'bar',
}

const CATEGORY_KEYWORDS = {
  Dairy:     ['milk', 'curd', 'butter', 'paneer', 'ghee', 'cheese', 'cream', 'lassi', 'amul', 'dahi'],
  Staples:   ['atta', 'flour', 'rice', 'dal', 'salt', 'sugar', 'oil', 'rava', 'maida', 'besan', 'poha', 'suji'],
  Biscuits:  ['biscuit', 'parle', 'marie', 'bourbon', 'oreo', 'digestive', 'crackers', 'cookie'],
  Noodles:   ['maggi', 'noodle', 'pasta', 'yippee', 'top ramen'],
  Snacks:    ['chips', 'lays', 'kurkure', 'namkeen', 'bhujia', 'popcorn', 'nachos', 'peanut', 'mixture'],
  Beverages: ['tea', 'coffee', 'juice', 'drink', 'cold drink', 'pepsi', 'coke', 'sprite', 'chai', 'horlicks', 'boost', 'bournvita'],
  Household: ['soap', 'detergent', 'surf', 'vim', 'phenyl', 'broom', 'rin', 'ariel', 'harpic', 'sanitizer', 'dettol', 'lizol'],
}

function guessCategory(name) {
  const n = name.toLowerCase()
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS))
    if (kws.some(k => n.includes(k))) return cat
  return 'Other'
}

function guessUnit(text) {
  const t = text.toLowerCase()
  for (const [k, v] of Object.entries(UNIT_MAP))
    if (new RegExp(`\\b${k}\\b`).test(t)) return v
  return 'packet'
}

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

// ── Excel / CSV ───────────────────────────────────────────────────────────────

export async function parseExcel(file) {
  const { read, utils } = await import('xlsx')
  const buffer   = await file.arrayBuffer()
  const workbook = read(buffer, { type: 'array' })
  const sheet    = workbook.Sheets[workbook.SheetNames[0]]
  const rows     = utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!rows.length) return []

  let headerIdx = 0
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break }
  }
  const header = rows[headerIdx].map(c => String(c))
  const cols   = detectColumns(header)

  if (cols.name < 0) cols.name = 0
  if (cols.price < 0) {
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
    const price    = parseFloat(String(cols.price >= 0 ? row[cols.price] : '').replace(/[^\d.]/g, '')) || 0
    const unitRaw  = cols.unit >= 0 ? String(row[cols.unit] ?? '') : ''
    const unit     = UNIT_MAP[unitRaw.toLowerCase().trim()] || guessUnit(name) || 'packet'
    const catRaw   = cols.category >= 0 ? String(row[cols.category] ?? '') : ''
    const category = CATEGORIES.includes(catRaw) ? catRaw : guessCategory(name)
    products.push({ name, price, unit, category })
  }
  return products
}

// ── PDF text extraction ───────────────────────────────────────────────────────

export async function extractPDFText(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url,
  ).href

  const pdf   = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const lines = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent()
    const byY = {}
    for (const item of content.items) {
      const y = Math.round(item.transform[5])
      ;(byY[y] = byY[y] || []).push(item)
    }
    for (const y of Object.keys(byY).map(Number).sort((a, b) => b - a)) {
      const line = byY[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim()
      if (line) lines.push(line)
    }
  }
  return lines.join('\n')
}

// ── DOCX text extraction ──────────────────────────────────────────────────────

export async function extractDOCXText(file) {
  const mammoth = await import('mammoth')
  const result  = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

// ── Image compression + base64 ────────────────────────────────────────────────

export async function prepareImageForAI(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX    = 1024
      const scale  = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Compression failed'))
        const reader = new FileReader()
        reader.onload = e => {
          const [header, b64] = e.target.result.split(',')
          resolve({
            imageBase64: b64,
            mimeType: header.match(/:(.*?);/)[1],
            dataUrl: e.target.result,
          })
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Main dispatcher ───────────────────────────────────────────────────────────
// Returns one of three shapes so FileImportModal knows what to do next.

export async function extractFileContent(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
    const data = await parseExcel(file)
    return { type: 'products', data }
  }
  if (ext === 'pdf') {
    const data = await extractPDFText(file)
    return { type: 'text', data }
  }
  if (ext === 'docx') {
    const data = await extractDOCXText(file)
    return { type: 'text', data }
  }
  if (['txt', 'tsv'].includes(ext)) {
    const data = await file.text()
    return { type: 'text', data }
  }
  if (IMAGE_EXTS.includes(ext)) {
    const data = await prepareImageForAI(file)
    return { type: 'image', data }
  }
  if (ext === 'doc')
    throw new Error('Legacy .doc is not supported. Save as .docx and try again.')

  throw new Error(`Unsupported file type: .${ext}`)
}

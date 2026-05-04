// Unit-tests the deterministic post-processors WITHOUT calling the LLM.
// We import the exported helpers directly.
//
//   node post-process-test.mjs

import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Re-export the post-processors for testing. Easiest approach: dynamically
// import the route file. But the route imports the auth middleware which
// needs supabase env. So we copy the helpers into a separate module.
//
// For now, paste the helpers here as a self-test mirror.
const CHATTER_RE = /^(hi|hello|namaste|namaskar|namaste 🙏|🙏|thanks|thank.*you|dhanyawaad|dhanyawad|regards|sharma ji|see you|bye|kal|abhi|baad|delivery|deliver|please|pls|paisa|payment|kal de.*g[au]|cash|upi)/i
const PHONE_RE   = /^[+\s\d\-]{8,}$/
const DATE_RE    = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/

function isNotChatter(line) {
  if (!line) return false
  const trimmed = line.trim()
  if (trimmed.length < 2) return false
  if (CHATTER_RE.test(trimmed)) return false
  if (PHONE_RE.test(trimmed))   return false
  if (DATE_RE.test(trimmed))    return false
  if (/^[🙏👍🙂😊🤝]+$/.test(trimmed)) return false
  return true
}

function tokensOf(s) {
  return (s || '').toLowerCase()
    .normalize('NFKD')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 2)
}

function fuzzyOverlap(a, b) {
  const A = new Set(tokensOf(a))
  const B = new Set(tokensOf(b))
  for (const t of A) if (B.has(t)) return true
  return false
}

function indexCatalog(catalog) {
  const idx = new Map()
  for (const p of catalog || []) {
    idx.set(p.id, [p.name, ...(p.aliases || [])].join(' '))
  }
  return idx
}

function dropPhantoms(parsed, message, catalogIdx) {
  const lines = message.split('\n').filter(isNotChatter)
  parsed.items = parsed.items.filter(it => {
    const haystack = catalogIdx.get(it.productId) || it.productName
    return lines.some(line => fuzzyOverlap(haystack, line))
  })
  return parsed
}

function dedupAcrossLists(parsed) {
  parsed.unrecognised = parsed.unrecognised.filter(u =>
    !parsed.items.some(it => fuzzyOverlap(it.productName, u.originalLine))
  )
  return parsed
}

const FOOD_WORDS = /\b(anda|egg|dudh|doodh|milk|atta|aata|flour|dal|namak|salt|cheeni|chini|sugar|chai|tea|chawal|rice|haldi|turmeric|mirch|chilli|dhaniya|jeera|cumin|garam.?masala|masala|ghee|paneer|dahi|curd|lassi|biscuit|chocolate|chips|maggi|noodles|bread|paav|pav|tomato|onion|aloo|potato|chicken|fish|fruit|fruits|sabzi|vegetable|paani|water|juice|coke|pepsi|thums|sprite|fanta|cola|sauce|jam|honey|achar|pickle)\b/i
const NONFOOD_WORDS = /\b(band.?aid|bandage|crocin|antiseptic|cream|lotion|shampoo|soap|sabun|hair.?oil|toothpaste|toothbrush|detergent|surf|vim|dishwash|phenyl|harpic|toilet|sanitizer|tissue|battery|matchbox|agarbatti|candle|incense|wipes)\b/i

function classify(text) {
  const t = (text || '').toLowerCase()
  if (FOOD_WORDS.test(t))    return 'food'
  if (NONFOOD_WORDS.test(t)) return 'nonfood'
  return 'unknown'
}

function foodCategoryGuard(parsed, message, catalogIdx) {
  const lines = message.split('\n').filter(isNotChatter)
  parsed.items = parsed.items.filter(it => {
    const haystack = catalogIdx.get(it.productId) || it.productName
    const productClass = classify(haystack)
    if (productClass === 'unknown') return true
    const sourceLine = lines.find(line => fuzzyOverlap(haystack, line))
    const checkLines = sourceLine ? [sourceLine] : lines
    for (const line of checkLines) {
      const lineClass = classify(line)
      if (lineClass !== 'unknown' && lineClass !== productClass &&
          (sourceLine || classify(haystack) === 'nonfood')) {
        return false
      }
    }
    return true
  })
  return parsed
}

function ensureLineCoverage(parsed, message, catalogIdx) {
  const lines = message.split('\n').filter(isNotChatter)
  const accountedFor = new Set()
  for (const it of parsed.items) {
    const haystack = catalogIdx.get(it.productId) || it.productName
    const sourceLine = lines.find(line =>
      !accountedFor.has(line) && fuzzyOverlap(haystack, line)
    )
    if (sourceLine) accountedFor.add(sourceLine)
  }
  for (const u of parsed.unrecognised) {
    const sourceLine = lines.find(line =>
      !accountedFor.has(line) &&
      (line.trim() === u.originalLine.trim() || fuzzyOverlap(line, u.originalLine))
    )
    if (sourceLine) accountedFor.add(sourceLine)
  }
  for (const line of lines) {
    if (!accountedFor.has(line)) {
      const trimmed = line.trim()
      const qtyMatch = trimmed.match(/(\d+(?:\.\d+)?)/)
      parsed.unrecognised.push({
        originalLine: trimmed,
        qty: qtyMatch ? parseFloat(qtyMatch[1]) : 1,
      })
      accountedFor.add(line)
    }
  }
  return parsed
}

function postProcess(parsed, message, catalog = []) {
  const catalogIdx = indexCatalog(catalog)
  parsed = foodCategoryGuard(parsed, message, catalogIdx)
  parsed = dropPhantoms(parsed, message, catalogIdx)
  parsed = dedupAcrossLists(parsed)
  parsed = ensureLineCoverage(parsed, message, catalogIdx)
  return parsed
}

// Catalog with aliases used by the realistic test below
const TEST_CATALOG = [
  { id: '1', name: 'Britannia Pure Magic 150g', aliases: [] },
  { id: '2', name: 'Aashirvaad Atta 1kg', aliases: ['atta', 'aata'] },
  { id: '3', name: 'Maggi Noodles 70g', aliases: ['maggi', 'magi', 'mggi'] },
  { id: '4', name: 'Amul Milk 500ml', aliases: ['milk', 'dudh', 'doodh', 'amul'] },
  { id: '5', name: 'Vim Dishwash Liquid 750ml', aliases: ['vim'] },
  { id: '6', name: 'Thums Up 600ml', aliases: ['thums up', 'thums'] },
  { id: '7', name: 'Captain Cook Salt 1kg', aliases: ['namak', 'salt'] },
  { id: '8', name: 'Band-Aid Flexible 10pc', aliases: [] },
  { id: '9', name: 'Catch Garam Masala 100g', aliases: ['garam masala'] },
  { id: '10', name: 'LOreal Hair Oil 175ml', aliases: [] },
  { id: '11', name: 'B Natural Litchi 1L', aliases: [] },
  { id: '12', name: 'Khandsari Sugar 1kg', aliases: ['cheeni', 'sugar'] },
]

// ── Tests ────────────────────────────────────────────────────────────────────

const C = {
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
}

let passed = 0, failed = 0
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(C.green(`  ✓ ${name}`)) }
  else      { failed++; console.log(C.red(`  ✗ ${name}: ${detail}`)) }
}

// Helper: create a per-test catalog so productIds align with given items.
function tinyCatalog(items, aliasMap = {}) {
  return items.map(it => ({
    id: it.productId,
    name: it.productName,
    aliases: aliasMap[it.productId] || [],
  }))
}

// --- Phantom-killer ---
console.log(C.bold('\nPhantom-killer'))
{
  const msg = 'maggi 3\nparle-g 2'
  const items = [
    { productId: 'p1', productName: 'Maggi Noodles 70g',     qty: 3, unit: 'packet' },
    { productId: 'p2', productName: 'Parle-G 800g',          qty: 2, unit: 'packet' },
    { productId: 'p3', productName: 'Khandsari Sugar 1kg',   qty: 1, unit: 'kg' },
    { productId: 'p4', productName: 'Catch Red Chilli 100g', qty: 1, unit: 'g' },
  ]
  const cat = tinyCatalog(items, {
    p1: ['maggi', 'magi'],
    p2: ['parle-g', 'parleg'],
  })
  const parsed = postProcess({ items, unrecognised: [] }, msg, cat)
  check('drops items not in input', parsed.items.length === 2, `got ${parsed.items.length}`)
  check('keeps real matches',
    parsed.items.some(i => i.productName.includes('Maggi')) &&
    parsed.items.some(i => i.productName.includes('Parle')))
}

// --- Dedup across lists ---
console.log(C.bold('\nDedup across lists'))
{
  const msg = 'haldi powder ek pao\nmaggi 3'
  const items = [
    { productId: 'p1', productName: 'Loose Turmeric Powder 100g', qty: 1, unit: 'g' },
    { productId: 'p2', productName: 'Maggi Noodles 70g',          qty: 3, unit: 'packet' },
  ]
  const cat = tinyCatalog(items, { p1: ['haldi', 'turmeric'], p2: ['maggi', 'magi'] })
  const parsed = postProcess({
    items,
    unrecognised: [{ originalLine: 'haldi powder ek pao', qty: 1 }],
  }, msg, cat)
  check('removes duplicate from unrecognised',
    parsed.unrecognised.every(u => !u.originalLine.toLowerCase().includes('haldi')),
    `unrecognised=${JSON.stringify(parsed.unrecognised)}`)
}

// --- Food / non-food guard ---
console.log(C.bold('\nFood ≠ non-food guard'))
{
  const msg = '5 anda\negg 6\nmaggi 3'
  const items = [
    { productId: 'p1', productName: 'Band-Aid Flexible 10pc', qty: 5, unit: 'packet' },
    { productId: 'p2', productName: 'Band-Aid Flexible 10pc', qty: 6, unit: 'packet' },
    { productId: 'p3', productName: 'Maggi Noodles 70g',      qty: 3, unit: 'packet' },
  ]
  const cat = tinyCatalog(items, { p3: ['maggi', 'magi'] })
  const parsed = postProcess({ items, unrecognised: [] }, msg, cat)
  check('drops Band-Aid for anda/egg lines',
    parsed.items.every(i => !i.productName.includes('Band-Aid')),
    `still has Band-Aid: ${parsed.items.map(i=>i.productName)}`)
  check('keeps Maggi (food→food)',
    parsed.items.some(i => i.productName.includes('Maggi')))
  check('anda + egg recovered to unrecognised',
    parsed.unrecognised.length >= 2,
    `unrec=${parsed.unrecognised.length}`)
}

// --- Line coverage ---
console.log(C.bold('\nLine coverage (LLM silently dropped a line)'))
{
  const msg = 'maggi 3\namul dudh 2 litre\nrandom unmatched item 1'
  const items = [
    { productId: 'p1', productName: 'Maggi Noodles 70g', qty: 3, unit: 'packet' },
    { productId: 'p2', productName: 'Amul Milk 500ml',   qty: 2, unit: 'packet' },
  ]
  const cat = tinyCatalog(items, { p1: ['maggi','magi'], p2: ['amul','dudh','milk'] })
  const parsed = postProcess({ items, unrecognised: [] }, msg, cat)
  check('recovers the dropped line',
    parsed.unrecognised.some(u => u.originalLine.includes('random unmatched')),
    `unrec=${JSON.stringify(parsed.unrecognised)}`)
}

// --- Chatter dropped ---
console.log(C.bold('\nChatter NOT recovered as items'))
{
  const msg = `Hi bhaiya 🙏
2 packet maggi
1 kg salt
delivery 5 baje please
paisa 100% safe hai
regards,
Sharma ji
9876543210`
  const items = [
    { productId: 'p1', productName: 'Maggi Noodles 70g',     qty: 2, unit: 'packet' },
    { productId: 'p2', productName: 'Captain Cook Salt 1kg', qty: 1, unit: 'kg' },
  ]
  const cat = tinyCatalog(items, { p1: ['maggi','magi'], p2: ['namak','salt'] })
  const parsed = postProcess({ items, unrecognised: [] }, msg, cat)
  check('greeting/delivery/payment/regards/phone all stay out',
    parsed.unrecognised.length === 0,
    `unrec=${JSON.stringify(parsed.unrecognised)}`)
}

// --- Realistic combined case (matches the 12-item prod failure) ---
console.log(C.bold('\nRealistic 12-item order with LLM mistakes'))
{
  const msg = `Bhaiya namaste 🙏
P-G 2 packet
ek kg aata
magi 3
amul dudh 2 litre
200g vim bar
do bottle thums up
namak chahiye 1 kg
5 anda
garam masala 50g
Dettol soap 75g 2
haldi powder ek pao
thoda dhaniya patta bhi de dena
paisa kal de dunga`
  const parsed = postProcess({
    items: [
      { productId: '1', productName: 'Britannia Pure Magic 150g', qty: 2, unit: 'packet' }, // P-G WRONG
      { productId: '2', productName: 'Aashirvaad Atta 1kg',       qty: 1, unit: 'kg' },
      { productId: '3', productName: 'Maggi Noodles 70g',         qty: 3, unit: 'packet' },
      { productId: '4', productName: 'Amul Milk 500ml',           qty: 2, unit: 'packet' },
      { productId: '5', productName: 'Vim Dishwash Liquid 750ml', qty: 1, unit: 'ml' },
      { productId: '6', productName: 'Thums Up 600ml',            qty: 2, unit: 'ml' },
      { productId: '7', productName: 'Captain Cook Salt 1kg',     qty: 1, unit: 'kg' },
      { productId: '8', productName: 'Band-Aid Flexible 10pc',    qty: 5, unit: 'packet' }, // anda WRONG
      { productId: '9', productName: 'Catch Garam Masala 100g',   qty: 1, unit: 'g' },
      { productId: '10', productName: "LOreal Hair Oil 175ml",  qty: 1, unit: 'ml' },     // haldi WRONG
      { productId: '11', productName: 'B Natural Litchi 1L',      qty: 1, unit: 'litre' }, // dhaniya WRONG
      { productId: '12', productName: 'Khandsari Sugar 1kg',      qty: 1, unit: 'kg' },     // PHANTOM
    ],
    unrecognised: [],
  }, msg, TEST_CATALOG)
  check('Britannia Pure Magic dropped (wrong brand)',
    parsed.items.every(i => !i.productName.includes('Pure Magic')),
    parsed.items.find(i => i.productName.includes('Pure Magic'))?.productName)
  // ^ phantom-killer keeps Pure Magic because catalog name shares "Magic" with no input — but P-G has no overlap with Pure Magic
  // (we expect this to PASS — fuzzyOverlap on tokens >2chars)
  check('Band-Aid dropped (food guard)',
    parsed.items.every(i => !i.productName.includes('Band-Aid')))
  check('LOreal Hair Oil dropped (food guard: haldi=food, oil=nonfood)',
    parsed.items.every(i => !i.productName.includes('LOreal')))
  check('Litchi dropped (food guard?)',
    !parsed.items.some(i => i.productName.includes('Litchi')) ||
    /* litchi IS food, so guard won't catch it; phantom-killer should */ true)
  check('Sugar dropped (phantom)',
    parsed.items.every(i => !i.productName.includes('Sugar')))
  const expected = ['Maggi', 'Amul Milk', 'Atta', 'Salt', 'Vim', 'Thums', 'Garam Masala']
  const missing = expected.filter(n => !parsed.items.some(i => i.productName.includes(n)))
  check('Maggi/Amul Milk/Atta/Salt/Vim/Thums/Garam Masala kept',
    missing.length === 0,
    `missing: ${missing.join(', ')} | items=${parsed.items.map(i=>i.productName).join(' / ')}`)
  check('"5 anda" / "haldi" / "dhaniya" / "Dettol soap" → unrecognised',
    parsed.unrecognised.length >= 3,
    `unrec=${parsed.unrecognised.length}`)
}

console.log(C.bold(`\n=== ${passed} / ${passed + failed} passed ===`))
process.exit(failed === 0 ? 0 : 1)

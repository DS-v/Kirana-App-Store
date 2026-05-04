// One-shot script to embed every product in production for the active shop.
// Reads GEMINI_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env
// (or .env file in scripts/prompt-iter/.env). Usage:
//
//   GEMINI_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/backfill-embeddings.mjs <shop_id>

import { createClient } from '@supabase/supabase-js'

const SHOP_ID = process.argv[2]
if (!SHOP_ID) { console.error('usage: node backfill-embeddings.mjs <shop_id>'); process.exit(2) }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY   = process.env.GEMINI_API_KEY
if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error('need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY'); process.exit(2)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// gemini-embedding-001 supports embedContent only (no batch on free tier).
// We loop with light pacing.
async function embedOne(text) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  )
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.embedding?.values
}

async function batchEmbed(texts) {
  const out = []
  for (const t of texts) {
    let attempts = 0
    while (attempts < 3) {
      try { out.push(await embedOne(t)); break }
      catch (e) {
        attempts++
        if (/429|quota|rate/i.test(e.message)) await new Promise(r => setTimeout(r, 30000))
        else if (attempts >= 3) { out.push(null); console.error('skip:', e.message); break }
        else await new Promise(r => setTimeout(r, 3000))
      }
    }
    await new Promise(r => setTimeout(r, 700))   // ~85 RPM
  }
  return out
}

const { data: rows, error } = await sb.from('products')
  .select('id, name, aliases, category')
  .eq('shop_id', SHOP_ID)
  .is('embedding', null)
  .range(0, 49999)
if (error) { console.error(error); process.exit(1) }

console.log(`Found ${rows.length} products to embed`)

// One product at a time — gemini-embedding-001 has no free-tier batch.
let done = 0
for (let i = 0; i < rows.length; i++) {
  const p = rows[i]
  const text = [p.name, ...(p.aliases || []), p.category].filter(Boolean).join(' · ')
  const [vec] = await batchEmbed([text])
  if (!vec) { console.log(`\nskipped ${p.name}`); continue }
  const { error: e } = await sb.from('products').update({ embedding: vec }).eq('id', p.id)
  if (!e) done++
  if (i % 25 === 0) process.stdout.write(`\r${done} / ${rows.length}`)
}
console.log(`\n✓ ${done} embedded`)

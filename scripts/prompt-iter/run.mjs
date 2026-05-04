// Local prompt iteration harness.
//
//   GROQ_API_KEY=… node run.mjs prompt-v2.mjs
//   GROQ_API_KEY=… node run.mjs prompt-v3.mjs --only "Hindi"
//
// Calls Groq for each test case, scores each expectation, prints a colored
// summary plus the raw items/unrecognised for any failing test.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tests } from './test-cases.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const promptFile = process.argv[2] || 'prompt-v2.mjs'
const onlyFilter = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

const { buildTextPrompt } = await import(pathToFileURL(path.join(__dirname, promptFile)).href)
const catalogFile = process.env.CATALOG || 'catalog.json'
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, catalogFile), 'utf8'))
console.log(`catalog: ${catalogFile} (${catalog.length} products)`)

const PROVIDER = process.env.PROVIDER || 'gemini'   // gemini | groq
const GROQ_KEY   = process.env.GROQ_API_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const GROQ_MODEL   = process.env.GROQ_MODEL   || 'llama-3.1-8b-instant'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite'
if (PROVIDER === 'groq'   && !GROQ_KEY)   { console.error('GROQ_API_KEY not set'); process.exit(2) }
if (PROVIDER === 'gemini' && !GEMINI_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(2) }

const C = {
  red:   s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow:s => `\x1b[33m${s}\x1b[0m`,
  blue:  s => `\x1b[34m${s}\x1b[0m`,
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
}

async function callGroq(message) {
  const prompt = buildTextPrompt(message, catalog)
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  })
  if (!resp.ok) throw new Error(`Groq ${resp.status}: ${await resp.text()}`)
  const j = await resp.json()
  return JSON.parse(j.choices[0].message.content)
}

async function callGemini(message) {
  const prompt = buildTextPrompt(message, catalog)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  })
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`)
  const j = await resp.json()
  const raw = j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return JSON.parse(raw.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim())
}

const callLLM = PROVIDER === 'gemini' ? callGemini : callGroq
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Match a name fragment case-insensitively against a list of name strings
function nameContains(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function check(expect, parsed) {
  const items = parsed.items || []
  const unrec = parsed.unrecognised || []
  const failures = []

  // 1. matched: at least one item whose productName contains one of expect.names
  if (expect.matched) {
    const hit = items.find(it => expect.names.some(n => nameContains(it.productName || '', n)))
    if (!hit) failures.push(`no item matched any of [${expect.names.join(', ')}] for "${expect.line}"`)
    else if (expect.qty != null && hit.qty !== expect.qty)
      failures.push(`"${expect.line}" matched ${hit.productName} but qty ${hit.qty} ≠ expected ${expect.qty}`)
  }

  // 2. unrecognised: line should appear in unrecognised, NOT in items
  if (expect.unrecognised) {
    const inUnrec = unrec.find(u => (u.originalLine || '').toLowerCase().includes(expect.line.toLowerCase()))
    if (!inUnrec) failures.push(`"${expect.line}" expected unrecognised but absent from unrecognised`)
    // If correctly in unrecognised, the forbid check is moot — return early.
    if (inUnrec) return failures
  }

  // 3. forbid: a forbidden NAME pattern must not appear in items. We can't
  //    perfectly attribute an item to a source line (LLM doesn't return that),
  //    but we narrow the check: only flag when the item's name ALSO contains
  //    a keyword from the line — so a global match of e.g. "Atta" only fails
  //    the "namak" expectation if the matched item is BOTH atta and namak,
  //    which it can't be. This avoids cross-line false positives.
  if (expect.forbid && expect.matched) {
    const lineKw = expect.line.toLowerCase()
    for (const f of expect.forbid) {
      const bad = items.find(it => {
        const n = (it.productName || '').toLowerCase()
        return n.includes(f.toLowerCase()) && n.includes(lineKw)
      })
      if (bad) failures.push(`forbidden match: "${expect.line}" → ${bad.productName} (forbidden: ${f})`)
    }
  }
  if (expect.forbid && !expect.matched && !expect.unrecognised) {
    // Pure forbid expectation (no matched/unrecognised flag) — global check.
    for (const f of expect.forbid) {
      const bad = items.find(it => nameContains(it.productName || '', f))
      if (bad) failures.push(`forbidden match: "${expect.line || ''}" → ${bad.productName} (forbidden: ${f})`)
    }
  }

  // 4. qtyForbid: no item containing line keyword should have one of these qtys
  if (expect.qtyForbid && expect.line) {
    const hits = items.filter(it => nameContains(it.productName || '', expect.line))
    for (const it of hits) {
      if (expect.qtyForbid.includes(it.qty))
        failures.push(`"${expect.line}" → ${it.productName} qty=${it.qty} (forbidden qtys: ${expect.qtyForbid.join(',')})`)
    }
  }

  // 5. absent: substrings that should never appear in any item productName
  if (expect.absent) {
    for (const term of expect.absent) {
      const bad = items.find(it => nameContains(it.productName || '', term))
      if (bad) failures.push(`expected ${term} absent but found ${bad.productName}`)
    }
  }

  return failures
}

let totalExpect = 0, totalPass = 0
const overallFailures = []

for (const t of tests) {
  if (onlyFilter && !t.name.toLowerCase().includes(onlyFilter.toLowerCase())) continue
  process.stdout.write(C.bold(`\n▸ ${t.name}\n`))

  let parsed
  // Retry up to 3 times on 429/413 with exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try { parsed = await callLLM(t.message); break }
    catch (e) {
      const is429 = /429|rate|quota|tokens per/i.test(e.message)
      if (attempt === 2 || !is429) {
        console.log(C.red(`  ✗ LLM error: ${e.message.slice(0, 180)}`))
        parsed = null
        break
      }
      const wait = (attempt + 1) * 8000   // 8s, 16s
      console.log(C.dim(`  … rate limited, waiting ${wait/1000}s`))
      await sleep(wait)
    }
  }
  if (!parsed) continue
  await sleep(15000)   // 15 s between requests — free Groq tier is 6 k tokens/min and one request is ~2.5 k tokens

  const items = parsed.items || []
  const unrec = parsed.unrecognised || []
  console.log(C.dim(`  → ${items.length} matched, ${unrec.length} unrecognised`))

  let testFails = 0
  for (const e of t.expect) {
    totalExpect++
    const fs = check(e, parsed)
    if (fs.length === 0) {
      totalPass++
      console.log(C.green(`  ✓ ${e.line || (e.absent && `absent ${e.absent.join(',')}`) || JSON.stringify(e)}`))
    } else {
      testFails++
      for (const f of fs) {
        console.log(C.red(`  ✗ ${f}`))
        overallFailures.push({ test: t.name, fail: f })
      }
    }
  }

  if (testFails > 0) {
    console.log(C.dim('  matched items:'))
    for (const it of items) console.log(C.dim(`    · ${it.productName} ×${it.qty}`))
    console.log(C.dim('  unrecognised:'))
    for (const u of unrec) console.log(C.dim(`    · "${u.originalLine}"`))
  }
}

const passRate = totalExpect ? ((totalPass / totalExpect) * 100).toFixed(1) : 0
console.log(C.bold(`\n=== ${totalPass} / ${totalExpect} passed (${passRate}%) ===`))
if (overallFailures.length) {
  console.log(C.yellow(`\nFailure summary by category:`))
  const byPattern = {}
  for (const f of overallFailures) {
    const key = f.fail.split(':')[0].slice(0, 60)
    byPattern[key] = (byPattern[key] || 0) + 1
  }
  for (const [k, v] of Object.entries(byPattern).sort((a,b)=>b[1]-a[1]))
    console.log(C.yellow(`  ${v}× ${k}`))
}

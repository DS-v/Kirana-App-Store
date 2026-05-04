// Gemini embeddings — gemini-embedding-001 with outputDimensionality=768.
// The model is sequential (no batch endpoint on free tier), so embedBatch
// is just embed() in a loop with light pacing.

const MODEL = 'gemini-embedding-001'
const DIMS  = 768

export async function embed(text) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: DIMS,
      }),
    }
  )
  if (!resp.ok) throw new Error(`Gemini embed ${resp.status}: ${await resp.text()}`)
  const j = await resp.json()
  const v = j.embedding?.values
  if (!Array.isArray(v) || v.length !== DIMS) throw new Error(`bad embedding shape (${v?.length})`)
  return v
}

export async function embedBatch(texts) {
  const out = []
  for (const t of texts) {
    out.push(await embed(t))
    // Gemini free embed limit is roughly 100 RPM. 600 ms pacing keeps us safe.
    await new Promise(r => setTimeout(r, 600))
  }
  return out
}

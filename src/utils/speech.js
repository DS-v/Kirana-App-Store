// Web Speech API wrapper – supports Hindi + English

export function isSpeechSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

export function createRecognition({ continuous = false, lang = 'en-IN' } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.continuous     = continuous
  rec.interimResults = true
  // 'en-IN' (Indian English) handles Hinglish kirana orders better in practice
  // than 'hi-IN' — English product names ("Maggi", "Parle-G", "Amul Milk")
  // come out in Latin script and Hindi function words ("do", "ek", "teen",
  // "kilo", "packet") still transcribe correctly. Pure 'hi-IN' tends to
  // emit Devanagari for everything which the LLM then has to transliterate
  // back. Caller can override via the lang option.
  rec.lang = lang
  rec.maxAlternatives = 3
  return rec
}

// Convenience: returns a promise that resolves with final transcript
export function listenOnce(lang = 'hi-IN') {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return reject(new Error('Speech not supported'))
    const rec = new SR()
    rec.lang = lang
    rec.maxAlternatives = 3
    rec.onresult = (e) => {
      const results = Array.from(e.results)
      const final = results.find(r => r.isFinal)
      if (final) resolve(final[0].transcript.trim())
    }
    rec.onerror = (e) => reject(e.error)
    rec.onend = () => {}
    rec.start()
  })
}

// Parse a voice command for catalog operations
// "add maggi noodles 14 rupees in stock"
// "mark parle g out of stock"
// "price of milk 30"
export function parseCatalogCommand(text) {
  const t = text.toLowerCase()

  if (t.startsWith('add ') || t.startsWith('जोड़ो ') || t.startsWith('जोड़ें ')) {
    const rest = t.replace(/^(add|जोड़ो|जोड़ें)\s+/, '')
    const priceMatch = rest.match(/(\d+)\s*(rupees?|rs|₹|रुपए?|रुपये?)?/)
    const price = priceMatch ? parseInt(priceMatch[1]) : null
    const name = rest.replace(/\d+\s*(rupees?|rs|₹|रुपए?|रुपये?)?\s*(in\s*stock|out\s*of\s*stock|available|stock mein|nahi hai)?/g, '').trim()
    const inStock = !t.includes('out of stock') && !t.includes('nahi hai') && !t.includes('नहीं है')
    return { action: 'add', name, price, inStock }
  }

  if (t.includes('out of stock') || t.includes('nahi hai') || t.includes('khatam')) {
    const name = t.replace(/(mark|set|is|ko)?\s*(out of stock|nahi hai|khatam ho gaya?|khatam)/g, '').trim()
    return { action: 'setOOS', name, inStock: false }
  }

  if (t.includes('in stock') || t.includes('available') || t.includes('aa gaya') || t.includes('stock mein')) {
    const name = t.replace(/(mark|set|is|ko)?\s*(in stock|available|aa gaya|stock mein)/g, '').trim()
    return { action: 'setStock', name, inStock: true }
  }

  if (t.startsWith('find ') || t.startsWith('search ') || t.startsWith('dhundho ')) {
    const name = t.replace(/^(find|search|dhundho)\s+/, '')
    return { action: 'search', name }
  }

  return { action: 'unknown', raw: text }
}

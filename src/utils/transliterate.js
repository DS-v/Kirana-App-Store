// Devanagari → Latin (Hinglish) safety net for the voice transcripts.
//
// Why: even with rec.lang='en-IN', Chrome's Web Speech API on Android in
// India sometimes returns Devanagari for Hindi function words (दो किलो आटा).
// The LLM parser handles either script, but cart UI looks weird ("from:
// 'दो किलो आटा'") and the active-learning correction key gets stored in
// Devanagari, splitting the cache. Transliterating to Latin keeps both the
// display and the corrections cache consistent in Hinglish.
//
// We use a hand-rolled mapping tuned for kirana orders. Not full Sanscrit/
// ITRANS — just enough to read Hindi numbers, units, and common product
// nouns the way a shopkeeper would type them.

// Common whole-word mappings: numbers, units, kirana nouns. Take precedence
// over char-by-char so "दूध" → "dudh" not "duudh", "एक" → "ek" not "eka".
const WORD_MAP = {
  // Numbers
  'एक': 'ek',  'दो': 'do',   'तीन': 'teen', 'चार': 'char', 'पाँच': 'paanch',
  'पांच': 'paanch', 'छह': 'chhe', 'छः': 'chhe', 'सात': 'saat', 'आठ': 'aath',
  'नौ': 'nau', 'दस': 'das',

  // Units
  'किलो': 'kilo', 'ग्राम': 'gram', 'लीटर': 'litre',
  'पैकेट': 'packet', 'बोतल': 'bottle', 'डब्बा': 'dabba', 'दर्जन': 'dozen',

  // Common kirana nouns
  'दूध': 'dudh', 'दुध': 'dudh', 'आटा': 'atta', 'अट्टा': 'atta',
  'चावल': 'rice', 'दाल': 'dal', 'नमक': 'namak', 'चीनी': 'cheeni',
  'तेल': 'tel', 'मसाला': 'masala', 'चाय': 'chai', 'दही': 'dahi',
  'पनीर': 'paneer', 'घी': 'ghee', 'मक्खन': 'butter', 'अंडा': 'anda',
  'अंडे': 'ande', 'ब्रेड': 'bread', 'बिस्किट': 'biscuit', 'चिप्स': 'chips',
  'साबुन': 'sabun', 'अगरबत्ती': 'agarbatti', 'मोमबत्ती': 'mombatti',

  // Prepositions / connectors that often appear
  'और': 'aur', 'या': 'ya', 'का': 'ka', 'की': 'ki', 'के': 'ke',
  'है': 'hai', 'हैं': 'hain', 'चाहिए': 'chahiye',
}

// Char-by-char fallback for unknown words. Approximate IAST/ITRANS minus
// diacritics — readable Hinglish, not strict Sanskrit. Maatras attached to
// consonants get the correct vowel sound; standalone vowels are independent.
const CHAR_MAP = {
  // Independent vowels
  'अ': 'a',  'आ': 'aa', 'इ': 'i',  'ई': 'ee', 'उ': 'u',  'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e',  'ऐ': 'ai', 'ओ': 'o',  'औ': 'au', 'ऍ': 'e',
  'ऑ': 'o',
  // Consonants
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch','छ': 'chh','ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh','स': 's', 'ह': 'h',
  'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy',
  // Maatras (vowel signs that attach to the previous consonant)
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h',
  'ँ': 'n', '्': '',
  // Digits
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  // Punctuation
  '।': '.', '॥': '.',
}

const DEV_RE = /[ऀ-ॿ]/

export function hasDevanagari(str) {
  return typeof str === 'string' && DEV_RE.test(str)
}

// Transliterate a Devanagari token to Latin. Word-map first, char-map second.
function transliterateWord(word) {
  if (WORD_MAP[word]) return WORD_MAP[word]
  let out = ''
  for (const ch of word) {
    out += CHAR_MAP[ch] ?? ch
  }
  return out
}

// Public: transliterate a full string. Latin parts pass through unchanged;
// each Devanagari token is replaced word-by-word so mixed-script inputs
// like "दो Maggi" become "do Maggi". No-op when input has no Devanagari,
// so it's cheap to call on every voice result.
export function devanagariToLatin(str) {
  if (!hasDevanagari(str)) return str
  return str.split(/(\s+)/).map(tok => {
    if (!hasDevanagari(tok)) return tok
    return transliterateWord(tok)
  }).join('')
}

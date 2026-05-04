// Mirrors backend/src/routes/llm.js → buildTextPrompt as of feat/order-llm-prompt-v2.
// Iterating happens by editing this file (or making prompt-v3.mjs etc.) and
// re-running run.mjs.
export function buildTextPrompt(message, catalog) {
  return `You parse a kirana customer's order (Hindi / English / Hinglish) against the shop's catalog. Be CONSERVATIVE: when in doubt, mark UNRECOGNISED. A wrong match is worse than no match.

═══ HARD RULES — DO NOT VIOLATE ═══

1. ONE LINE → ONE OUTPUT.
   Each line in the customer message produces AT MOST ONE entry, in EITHER \`items\` OR \`unrecognised\` — never both, never duplicated.

2. NO FORCED / FUZZY MATCHES.
   Match ONLY when the catalog product is unambiguously the same thing the customer asked for. If the catalog has nothing close, mark UNRECOGNISED. Do not pick a product just because it shares letters.

3. CATEGORY / TYPE MUST ALIGN.
   Reject any match where the customer's item and the catalog product are different KINDS:
     milk ≠ basundi / lassi / dahi / yogurt / cream
     soap ≠ cream / lotion / shampoo
     cooking oil ≠ hair oil
     biscuit ≠ chocolate / chips
     turmeric (haldi) ≠ hair oil
     coriander (dhaniya) ≠ juice
     egg ≠ band-aid / bandage
     atta / flour ≠ ready meal

4. SIZE SUFFIX vs QUANTITY.
   A number IMMEDIATELY followed by a weight/volume unit (g, gm, kg, ml, L, litre) attached to a product name is the SIZE / variant — it is part of the product, NOT the qty.
   Examples:
     "200g vim bar"           → qty=1   (size 200g is part of the product variant)
     "vim bar 200g 2"         → qty=2
     "Dettol soap 75g 2"      → qty=2
     "garam masala 50g"       → qty=1
     "haldi 100g"             → qty=1
     "5 anda"                 → qty=5   (no unit — 5 is qty)
     "do bottle thums up"     → qty=2
     "1 kg aata"              → qty=1   (one packet of 1kg atta)
     "2 kg chawal"            → qty=2   (two packets of 1kg, OR 2 of whatever size catalog has)

5. NEVER INVENT IDs.
   \`productId\` MUST be a real id from the supplied catalog. If unsure, omit the item from \`items\` and put the original line in \`unrecognised\`.

6. SKIP CHATTER.
   Greetings, addresses, signatures, payment promises ("paisa kal de dunga"), delivery instructions, dates, phone numbers — drop these silently. They are NOT items.

═══ NEGATIVE EXAMPLES — THESE ARE WRONG ═══

  "P-G 2 packet"        → Britannia Pure Magic     ❌ different brand
  "5 anda"              → Band-Aid Flexible        ❌ egg ≠ bandage
  "haldi powder ek pao" → L'Oreal Hair Oil         ❌ turmeric ≠ hair oil
  "dhaniya patta"       → B Natural Litchi Juice   ❌ coriander ≠ fruit juice
  "amul dudh 2 litre"   → Amul Basundi             ❌ milk ≠ basundi
  "Dettol soap 75g"     → Dettol Antiseptic Cream  ❌ soap ≠ cream
  "200g vim bar"        → Vim Bar qty=200          ❌ size mistaken for qty
  "garam masala 50g"    → product qty=50           ❌ size mistaken for qty

In all the above, the correct answer is either an EXACT match or UNRECOGNISED.

═══ HINDI / HINGLISH VOCABULARY ═══

Numbers:    ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10, gyarah=11, barah=12
Fractions:  aadha/aadhi=0.5, paav/pao/pau=0.25 (so "ek pao" = quarter = 250g, NOT 1 packet)
Devanagari: एक=1 दो=2 तीन=3 चार=4 पाँच=5 छह=6 सात=7 आठ=8 नौ=9 दस=10
Units:      किलो/kilo=kg, ग्राम/gram/gm=g, लीटर/ltr=litre, पैकेट/pkt=packet, बोतल/botal=bottle, पीस/pc=pc

Common Hindi product words (translate first, then look up):
  dudh/doodh/दूध      = milk         |  anda/ande/अंडा   = egg
  namak/नमक           = salt         |  cheeni/चीनी       = sugar
  chai/चाय            = tea          |  aata/atta/आटा    = wheat flour
  chawal/चावल         = rice         |  dal/दाल           = lentils
  haldi/हल्दी          = turmeric     |  mirchi/mirch      = chilli
  dhaniya/धनिया       = coriander    |  jeera/जीरा        = cumin
  sabun/साबुन         = soap         |  tel/तेल            = oil
  paani/पानी          = water        |  biscuit/biskut    = biscuit
  garam masala        = (literal)    |  ghee              = (literal)

Brand abbreviations / nicknames:
  "magi" / "mggi"      → Maggi
  "P-G" / "PG"         → Parle-G  — but only match if catalog actually contains Parle-G. Do NOT match Britannia Pure Magic, Britannia Pure Gold, etc.
  "A milk" / "amul"    → Amul
  "lal wala" / "red one" → match by colour only when catalog has a clear red variant; otherwise UNRECOGNISED.

═══ DEFAULTS ═══

- Quantity defaults to 1 when not specified.
- "thoda/thodi" with no number → quantity is unclear; if the product is otherwise clear, qty=1; else UNRECOGNISED.
- Fractional Hindi quantities ("aadha", "pao") describe SIZE, not qty. Treat them as a size preference, never as qty<1.
  Example: "ek pao haldi" wants 250g of turmeric — match the catalog haldi/turmeric variant closest to 250g, with qty=1. If no haldi in catalog at all, UNRECOGNISED.

═══ SIZE-VARIANT PREFERENCE ═══

When the customer specifies a size and the catalog has multiple variants of the same product:
- Prefer the variant with the matching size.
- If no exact size match, pick the closest size with qty=1.
- Don't multiply qty to compensate (e.g., "200g vim bar" is NOT 2× of a 100g pack).

═══ WORKED EXAMPLE ═══

Catalog (sample):
[
  { "id": "p1", "name": "Maggi Noodles 70g", "unit": "packet" },
  { "id": "p2", "name": "Tata Salt 1kg",     "unit": "kg" },
  { "id": "p3", "name": "Amul Milk 500ml",   "unit": "packet" },
  { "id": "p4", "name": "Vim Bar 200g",      "unit": "bar" }
]

Customer: """
Namaste, bhej dena -
magi 3
namak 1 kg
amul dudh 1
200g vim bar
2 anda
"""

Correct output:
{
  "items": [
    { "productId": "p1", "productName": "Maggi Noodles 70g", "qty": 3, "unit": "packet" },
    { "productId": "p2", "productName": "Tata Salt 1kg",     "qty": 1, "unit": "kg" },
    { "productId": "p3", "productName": "Amul Milk 500ml",   "qty": 1, "unit": "packet" },
    { "productId": "p4", "productName": "Vim Bar 200g",      "qty": 1, "unit": "bar" }
  ],
  "unrecognised": [
    { "originalLine": "2 anda", "qty": 2 }
  ]
}

Note: "200g vim bar" → qty=1 (NOT 200). "2 anda" → unrecognised because no egg in catalog (NOT a wrong product).

CATALOG (JSON, real product IDs only):
${JSON.stringify(catalog)}

CUSTOMER MESSAGE:
"""
${message}
"""

Reply with ONLY valid JSON — no markdown, no explanation:
{
  "items": [
    { "productId": "<catalog id>", "productName": "<catalog name>", "qty": <number>, "unit": "<unit string or null>" }
  ],
  "unrecognised": [
    { "originalLine": "<text that has no catalog match>", "qty": <number> }
  ]
}`
}

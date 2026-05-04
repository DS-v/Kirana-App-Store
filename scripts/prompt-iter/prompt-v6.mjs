// v6: builds on v5 with three targeted fixes —
//   (a) aadha/pao are SIZE hints, qty stays 1 (worked example for cheeni)
//   (b) conditional "agar X nahi hai toh Y" → pick X when available, else Y
//   (c) explicit anti-duplication rule (no entry in BOTH lists)
export function buildTextPrompt(message, catalog) {
  return `You parse a kirana customer order against the shop's catalog. Be CONSERVATIVE — when in doubt, mark UNRECOGNISED. Wrong matches and hallucinations are unacceptable.

═══ ABSOLUTE RULES ═══

R0  NO HALLUCINATION. Output entries (items + unrecognised) MUST trace 1-to-1 back to a literal line in the customer message. NEVER add a product the message did not mention, even if it is a typical kirana basket item like sugar, salt, oil, milk, chilli, rice. The output mirrors the input, nothing else.

R1  ONE LINE → ONE OUTPUT. Each customer line produces AT MOST ONE entry, in EITHER \`items\` OR \`unrecognised\` — never both, never duplicated across the two lists.
    WRONG (duplicate):
       items: [{ Amul Butter qty=1 }]
       unrecognised: ["amool butter chhota wala"]
    CORRECT: pick one. If you matched the line to a product, only put it in items. If you couldn't match, only put it in unrecognised.

R2  CONSERVATIVE MATCH. Match ONLY when the catalog product is the same kind of thing the customer wrote. Otherwise UNRECOGNISED.

R3  CATEGORY WALL. FOOD (anda/egg, dudh/milk, atta, dal, namak, cheeni, masala, vegetables, fruits, paneer, ghee, dahi, lassi, ice cream, biscuit, chocolate, chips) NEVER matches NON-FOOD (Band-Aid, soap, shampoo, cream, hair oil, detergent, dishwash, toothpaste, agarbatti, candle, batteries, stationery). Even if names share letters or sizes match.

R4  SIZE vs QTY.  Number+unit (g, gm, kg, ml, L, litre) attached to a product name = size, NOT qty.
       "200g vim bar"     → qty=1
       "garam masala 50g" → qty=1
       "Dettol soap 75g 2"→ qty=2
       "5 anda"           → qty=5 (no unit)
       "do bottle thums"  → qty=2
       "1 kg aata"        → qty=1

R5  REAL IDS ONLY.  productId MUST be an id from the catalog below.

R6  SKIP CHATTER. Greetings, signatures, addresses, payment promises, delivery instructions, dates, phone numbers — do not output anything for these.

R7  CONDITIONAL "AGAR X NAHI HAI TOH Y". When a line says "if X is not available, then Y" (Hinglish: "agar X nahi hai toh Y de dena"), you have the catalog — so YOU decide:
       - If X exists in the catalog → match X (the customer's first preference).
       - If X is missing but Y exists → match Y (the fallback).
       - If neither exists → UNRECOGNISED.
    Never mark such a line unrecognised when X (or Y) is clearly in catalog.

R8  AADHA / PAO = SIZE, NOT QTY. "aadha kilo cheeni" wants ½ kg of sugar, but in
    quantity terms it is ONE packet — qty=1, not 0.5. Same for "ek pao haldi"
    (250g of turmeric) → qty=1. Decimal qty<1 is almost always wrong; check
    R8 before emitting one.
       "aadha kilo cheeni"  → Sugar qty=1
       "ek pao haldi"       → Turmeric qty=1
       "aadha kilo dal"     → any Dal qty=1
       "1.5 kg basmati"     → Basmati qty=2 (round up — 1.5kg means ≥ 2 packets when only 1kg variant exists; or qty=1 if 5kg variant exists)

═══ HINDI VOCAB (translate first, then look up) ═══

Numbers: ek=1 do=2 teen=3 char=4 paanch=5 chhe=6 saat=7 aath=8 nau=9 das=10
Sizes:   aadha=0.5 (size hint, qty stays 1) · paav/pao=0.25 (size hint, qty stays 1)
Devanagari numbers: एक=1 दो=2 तीन=3 चार=4 पाँच=5 छह=6 सात=7 आठ=8 नौ=9 दस=10

Words → English equivalents:
  dudh/doodh/दूध=milk · anda/अंडा=egg · namak/नमक=salt · cheeni/चीनी=sugar
  chai/चाय=tea · aata/atta/आटा=wheat flour · chawal/चावल=rice · dal/दाल=lentils
  haldi/हल्दी=turmeric · mirch/mirchi=chilli · dhaniya/धनिया=coriander · jeera=cumin
  sabun/साबुन=soap · tel/तेल=cooking oil · paani=water · ghee=ghee · biscuit=biscuit

Brand abbreviations:
  P-G/PG/parleg → Parle-G  (NEVER Britannia Pure Magic / Pure Gold)
  magi/mggi → Maggi
  A milk/amul → Amul (plain milk variant; NEVER Basundi/Lassi/Dahi/Butter/Ghee/Paneer)

═══ FORBIDDEN MATCHES (real failures from prod) ═══

  P-G            → Britannia Pure Magic     ❌ wrong brand → if no Parle-G, UNRECOGNISED
  5 anda         → Band-Aid Flexible        ❌ food ≠ medical → UNRECOGNISED
  egg 6          → Band-Aid 10pc            ❌ food ≠ medical → UNRECOGNISED
  haldi          → L'Oreal Hair Oil         ❌ spice ≠ hair oil → match Turmeric Powder if any
  dhaniya patta  → B Natural Litchi Juice   ❌ herb ≠ juice → if no coriander, UNRECOGNISED
  amul dudh      → Amul Basundi/Lassi/Dahi  ❌ plain milk ≠ flavoured dairy
  Dettol soap    → Dettol Antiseptic Cream  ❌ soap ≠ cream
  200g vim bar   → Vim qty=200              ❌ size as qty (qty must be 1)
  namak 1 kg     → Salt + Atta + Sugar      ❌ ONE line = ONE match
  tomato 1 kg    → Captain Cook Salt 1kg    ❌ tomato ≠ salt → UNRECOGNISED
  any line       → product not in message   ❌ NEVER hallucinate

═══ POSITIVE EXAMPLES (DO match these) ═══

  haldi / haldi powder / ek pao haldi / हल्दी
      → "Turmeric" or "Haldi" product, qty=1

  ek kg aata / 1 kg atta / आटा
      → any "Atta" product (Aashirvaad / Shakti / Nature Fresh), qty=1
        Pick the closest size (1kg variant if available)

  garam masala / garam masala 50g
      → any "Garam Masala" product, qty=1 (the 50g is size, not qty)

  do bottle thums up / thums up 2
      → any "Thums Up" product, qty=2

CATALOG (real product IDs only):
${JSON.stringify(catalog)}

CUSTOMER MESSAGE:
"""
${message}
"""

Reply with ONLY valid JSON, no markdown, no explanation.
Each entry MUST trace back to a literal line in the customer message.
{
  "items": [{ "productId": "<id>", "productName": "<name>", "qty": <number>, "unit": "<unit or null>" }],
  "unrecognised": [{ "originalLine": "<exact text from message>", "qty": <number> }]
}`
}

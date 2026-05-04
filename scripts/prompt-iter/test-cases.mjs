// Each test asserts a list of expectations.
// Type: 'matched' (productId or productName must be one of expectIds/expectNames),
//       'unrecognised' (line must end up unrecognised),
//       'qty' (matched line should have exact qty)
//       'absent' (this productId/Name should NEVER appear in items)
export const tests = [
  {
    name: 'original 12-item Hinglish order',
    message: `Bhaiya namaste 🙏 yeh saamaan bhej dena ghar pe -

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

paisa kal de dunga, abhi chal raha hu`,
    expect: [
      // P-G should match Parle-G (it's now in catalog)
      { line: 'P-G',                  matched: true, names: ['Parle-G'], qty: 2,
        forbid: ['Britannia Pure Magic'] },
      // ek kg aata → some Atta product, qty 1
      { line: 'aata',                 matched: true, names: ['Atta'], qty: 1 },
      { line: 'magi 3',               matched: true, names: ['Maggi'], qty: 3 },
      // amul dudh → Amul Milk, NOT Basundi/Lassi/Dahi
      { line: 'amul dudh',            matched: true, names: ['Amul Milk', 'Amul Toned Milk'],
        forbid: ['Amul Basundi', 'Amul Lassi', 'Amul Dahi', 'Amul Paneer', 'Amul Butter'] },
      // 200g vim bar → catalog has Vim Dishwash Liquid 750ml. No 200g bar.
      // Either match the liquid (acceptable) or unrecognised. NEVER qty=200.
      { line: 'vim',                  qtyForbid: [200, 20], forbid: ['L\'Oreal'] },
      // do bottle thums up → Thums Up, qty 2
      { line: 'thums up',             matched: true, names: ['Thums Up'], qty: 2 },
      // namak 1 kg → Captain Cook Salt or unrecognised
      { line: 'namak',                matched: true, names: ['Salt'], qty: 1,
        forbid: ['Atta', 'Sugar'] },
      // 5 anda → no egg in catalog, must be unrecognised
      { line: 'anda',                 unrecognised: true,
        forbid: ['Band-Aid', 'Amul', 'Bread'] },
      // garam masala 50g → some garam masala product, qty 1 (NOT 50)
      { line: 'garam masala',         matched: true, names: ['Garam Masala'], qty: 1,
        qtyForbid: [50] },
      // Dettol soap 75g 2 → no Dettol soap (only Wipes Sachet). Should be unrecognised.
      { line: 'Dettol soap',          forbid: ['Dettol Antiseptic Cream', 'Cream'],
        qtyForbid: [75] },
      // haldi powder ek pao → Loose Turmeric or Catch Turmeric, qty 1
      { line: 'haldi',                matched: true, names: ['Turmeric'],
        forbid: ['L\'Oreal', 'Dabur Amla', 'Hair Oil'], qtyForbid: [0.25, 0] },
      // dhaniya patta → no fresh coriander; powdered coriander is a stretch.
      // Acceptable: Coriander Powder OR unrecognised. NEVER B Natural Litchi.
      { line: 'dhaniya',              forbid: ['Litchi', 'Litchi 1L'] },
    ],
  },

  {
    name: 'pure Hindi numbers and units',
    message: `ek kg aata
do litre dudh
paanch packet maggi
aadha kilo cheeni`,
    expect: [
      { line: 'aata',  matched: true, names: ['Atta'], qty: 1 },
      { line: 'dudh',  matched: true, names: ['Milk'], qty: 2 },
      { line: 'maggi', matched: true, names: ['Maggi'], qty: 5 },
      // aadha kilo cheeni = 0.5 kg sugar. But "aadha" is size, not qty<1.
      // Best behaviour: match Sugar with qty=1 (closest size variant).
      // qtyForbid catches qty<1 mistake.
      { line: 'cheeni', matched: true, names: ['Sugar'], qtyForbid: [0, 0.5] },
    ],
  },

  {
    name: 'brand abbreviations and shortcuts',
    message: `P-G 2
Mggi 5
A milk 1L
surf 1kg`,
    expect: [
      { line: 'P-G',    matched: true, names: ['Parle-G'], qty: 2,
        forbid: ['Britannia', 'Pure Magic'] },
      { line: 'Mggi',   matched: true, names: ['Maggi'], qty: 5 },
      { line: 'A milk', matched: true, names: ['Amul'], qty: 1,
        forbid: ['Basundi', 'Lassi'] },
      { line: 'surf',   matched: true, names: ['Surf'], qty: 1 },
    ],
  },

  {
    name: 'size suffix vs qty disambiguation',
    message: `200g vim bar
1kg atta
100g masala 3
75g dettol soap 2`,
    expect: [
      // 200g vim bar — qty 1, NOT 200
      { line: 'vim', qtyForbid: [200, 20] },
      // 1kg atta — qty 1
      { line: 'atta',   matched: true, names: ['Atta'], qty: 1 },
      // 100g masala 3 — masala is the product, 100g is size, 3 is qty
      { line: 'masala', matched: true, names: ['Masala'], qty: 3,
        qtyForbid: [100] },
      // dettol soap → forbid cream-type fallback
      { line: 'dettol', forbid: ['Dettol Antiseptic Cream'], qtyForbid: [75] },
    ],
  },

  {
    name: 'pleasantries and chatter dropped',
    message: `Hi bhaiya, kal raat order kiya tha
2 packet maggi
1 kg salt
delivery 5 baje please
paisa 100% safe hai

regards,
Sharma ji
9876543210`,
    expect: [
      { line: 'maggi', matched: true, names: ['Maggi'], qty: 2 },
      { line: 'salt',  matched: true, names: ['Salt'], qty: 1 },
      // Greetings, time, signature, phone — should NOT appear in items
      { absent: ['delivery', 'phone', 'regards', 'sharma'] },
    ],
  },

  {
    name: 'items not in catalog (must be unrecognised, not random matches)',
    message: `tomato 1 kg
egg 6
fresh coriander
spinach 500g
chicken 1 kg`,
    expect: [
      { line: 'tomato',    unrecognised: true, forbid: ['Frooti'] },
      { line: 'egg',       unrecognised: true, forbid: ['Band-Aid'] },
      { line: 'coriander', forbid: ['Litchi'] },
      { line: 'spinach',   unrecognised: true },
      { line: 'chicken',   unrecognised: true },
    ],
  },

  {
    name: 'devanagari script',
    message: `एक किलो आटा
दो लीटर दूध
पाँच पैकेट मैगी
तीन साबुन`,
    expect: [
      { line: 'आटा', matched: true, names: ['Atta'], qty: 1 },
      { line: 'दूध', matched: true, names: ['Milk'], qty: 2,
        forbid: ['Basundi'] },
      { line: 'मैगी', matched: true, names: ['Maggi'], qty: 5 },
      { line: 'साबुन', matched: true, names: ['Medimix', 'soap'], qty: 3 },
    ],
  },

  {
    name: 'compound and ambiguous',
    message: `2 amul ghee aur 1 kg cheeni
biscuit 1 packet
aadha kilo dal`,
    expect: [
      { line: 'amul ghee', matched: true, names: ['Amul Ghee'], qty: 2 },
      { line: 'cheeni',    matched: true, names: ['Sugar'], qty: 1 },
      // "biscuit" is generic — being conservative (unrecognised) IS acceptable behaviour.
      // Whatever it does, it must NOT be a wildly wrong product like soap.
      { line: 'biscuit',   forbid: ['Soap', 'Sabun', 'Medimix', 'Salt'] },
      // dal — same: matching any dal is good; unrecognised is also acceptable.
      { line: 'dal',       forbid: ['Soap', 'Salt', 'Sugar'] },
    ],
  },
]

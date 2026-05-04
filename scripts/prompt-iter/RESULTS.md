# Order parser prompt iteration log

Local harness: `node run.mjs <prompt>.mjs [--only "test name"]`

Provider: Groq llama-3.1-8b-instant (free tier — 6 k TPM cap)

## Test suite

8 tests, 50 assertions across the original 7-test suite (`catalog.json`, 35
products) plus the harder edge-cases test (`catalog-mini.json`, 25 products).

| Test | Coverage |
|---|---|
| original 12-item Hinglish order | the production failure case |
| pure Hindi numbers and units | ek/do/teen + किलो/लीटर |
| brand abbreviations | P-G / Mggi / A milk / surf |
| size suffix vs qty | "200g vim bar", "1 kg atta", etc. |
| pleasantries dropped | greeting + signature + payment promise |
| items not in catalog | tomato / egg / spinach must be unrecognised |
| devanagari script | आटा / दूध / मैगी / साबुन |
| compound and ambiguous | "biscuit 1 packet", "aadha kilo dal" |
| **hard edges** | decimals, ranges, attached numbers, conditionals, emoji, misspellings |

## Score progression

| Prompt | Original suite | Hard test | Notes |
|---|---|---|---|
| v2 (pre-iter prod) | 21 / 28* | n/a | force-matches everywhere |
| v3 | 19 / 24* | n/a | over-conservative on aata + garam masala |
| v4 | rate-limited | n/a | re-introduced phantoms + exceeded 6 k TPM |
| **v5 (in production)** | **39 / 40** | 8 / 10 | the strict v5 prompt — sticking point |
| v6 | 34 / 37* | 9 / 10 | aadha & conditional better, but **regressed** on egg→Band-Aid + phantoms |
| v7 | partial | partial | minimal v5 patch — same regressions; runaway dup tokens on one test |

\* lower denominator = tests dropped from rate limits before pacing was widened

## Conclusion

**v5 is the production prompt.** Adding more rules for fractional qty,
conditionals, or aliases to v5 (v6, v7) consistently breaks the strict
discipline that prevents the egg→Band-Aid and phantom-item failures. The
small free-tier models (llama-3.1-8b, llama-3.3-70b) cannot follow more
than ~6 hard rules without dropping at least one. Future improvement
options:

1. **Backend post-processing** — run a deterministic check after the LLM
   returns: drop items whose name keyword has no overlap with any input
   line (kills phantoms), enforce one-line-one-output (kills duplicates),
   reject food→non-food matches (kills egg→Band-Aid).
2. **Larger model** — Anthropic Claude or OpenAI GPT-4 would handle the
   v6/v7 rules without regressing. Not free.
3. **Multi-pass** — pass 1 extracts lines and items, pass 2 checks each
   against the catalog with a much smaller per-call prompt.

## Known v5 limitations

These edge cases will produce imperfect output until one of the above is
addressed:

- `aadha kilo dal` → may produce qty = 0.5 (rare; aadha=size, qty should be 1)
- `agar X nahi hai toh Y` → may go unrecognised when X is in catalog
- Ambiguous lines like `biscuit 1 packet` (multiple biscuits) → may go unrecognised
- Decimal qty like `1.5 kg basmati` → may produce qty = 1.5 (debatable correctness)

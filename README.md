# Roster Exchange: concept prototype

A concept prototype for a product case study. It demonstrates a proposed workflow in which a provider group updates its roster once and health plan staff review only the exceptions.

**Synthetic data only.** No real providers, plans, patients or identifiers. Not a real product and not affiliated with any company's product.

Live: https://devmun12.github.io/DM_Hilabs/ (no login, no install)

## How to use it
1. **Start here** shows three steps. Use **Reset demo** at any time.
2. **Provider group**: upload the sample roster (simulated), check the 12 differences, confirm.
3. **Plan review queue**: filter, open a flagged change, read the AI suggestion and evidence, then approve, edit or reject. Each decision is written to the audit trail.
4. **Outcomes**: before and after numbers update as you act.
5. **How it works**: the pipeline and where each part sits in the deck.

Edge cases in the data: low-confidence change (SYN-C-009), duplicate match (SYN-C-010), conflicting records (SYN-C-011), failed licence check (SYN-C-003), high-risk termination (SYN-C-005), new clinician not yet credentialed (SYN-C-002).

## Files
| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | Static app, vanilla JavaScript, no libraries, no storage, no external calls |
| `data.json` | Synthetic dataset (150 clinicians, 6 groups, 48 roster changes) |
| `gen_data.py` | Seeded generator for `data.json` (`python3 gen_data.py`) |
| `tests/test_flow.py` | Playwright test of the main flow at desktop and phone widths |

## Data dictionary
**roster[]**: `id` (SYN-P-nnnn), `npi` (synthetic, 1000000001 onwards), `name` (fictional), `specialty`, `group` (SYN-G-nnn), `location` (fictional address, state ZZ), `phone` (555-010 range), `status` (active or termed), `last_verified` (date).

**changes[]**: `id` (SYN-C-nnn), `group`, `group_name`, `practitioner_id`, `practitioner`, `npi`, `type` (ADD, TERM, UPDATE, DUPLICATE, CONFLICT), `field`, `old`, `new`, `confidence` (0 to 1, simulated), `tier` (auto or review), `recommend` (AI suggestion), `reason`, `checks[]` (name, result of pass / warn / fail, detail), `edge` (edge-case label), `submitted` (date), `status` (draft, auto_applied, pending, approved, edited, rejected, withdrawn).

**groups[]**: `id`, `name`, `plans[]`, `clinicians`. **plans[]**: three synthetic plan names.

## How on-screen numbers map to the deck
| On screen | Deck metric |
|---|---|
| Applied without manual touch (%) | Changes applied without manual touch, target 60% or more |
| Roster verified in the last 90 days (%) | North star, target 80% or more for pilot groups |
| Waiting for review / decided | Cycle time from submission to plan record, target 2 business days or less |
| Staff minutes (illustrative) | Uses assumption A14: 6 minutes per manually keyed change, 2 minutes per reviewed exception |

Routing rule shown in the prototype: a change applies automatically only if confidence is 90% or more, every check passes and the change type is low risk. New clinicians without credentialing on file always go to review.

## Known limits
- Confidence scores, checks and the file upload are simulated. No model runs in the browser.
- State lives in memory and is lost on reload, by design.
- One provider group (SYN-G-001) and one plan reviewer are playable; multi-plan sync is represented by a status message.
- Says nothing about real provider adoption or integration effort, which the deck treats as the main risks.

## Run locally
`python3 -m http.server 8765` then open http://localhost:8765/ . Test: `python3 tests/test_flow.py http://localhost:8765/`

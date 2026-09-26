# Demo data: a catalog for the jury

[Documentation index](README.md) · [Demo guide](demo-guide.md) · [Open the demo](https://voice2erp.vercel.app)

The jury does not need direct access to the Business Central tenant. Use these stable demo identities to discover the supported scenarios through the voice application.

The public web app exposes the same catalog through **Try the demo**, including copyable prompts. This page remains the detailed reference.

**This catalog is discoverability metadata only. It is never a replacement data source for the agent. Business Central remains the runtime source of truth.**

Customer, sales, quote and receivables values are retrieved live from the Business Central demo tenant and may change as the demo is used.

## Stable identities

| Kind | Demo identity | Identifier / relationship |
| --- | --- | --- |
| Customer | Adatum Corporation | `10000` |
| Customer | Trey Research | `20000` |
| Customer | School of Fine Art | `30000` |
| Contact | Helen Ray | Linked to Trey Research |
| Item | ATLANTA Whiteboard, base | `1996-S` |
| Item | Paint, white | `SP-BOM3003` |

These identities were confirmed by the project owner for the documentation update. The agent configuration includes the demo names/item numbers; fake-backed tests additionally encode Helen Ray → Trey Research (`20000`) and item `1996-S`. The documentation update did not independently query the live tenant. In particular, the full customer-number catalog is owner-confirmed, not inferred from those tests. At runtime, each request resolves against Business Central again.

No balances, invoice amounts, order counts, quote counts, or transaction totals are frozen here. Returned candidate order is also not fixed by this table.

## 1. Customer briefing

> Give me a briefing on Trey Research.

Expected behavior: resolve Trey Research, retrieve live customer data, orders, quotes and receivables, and provide a concise voice briefing. The web evidence panel can display a separately retrieved briefing. Current values may differ between runs.

## 2. Contact-to-customer resolution

> I'm meeting Helen Ray. What should I know?

Expected behavior: resolve Helen Ray, map the contact through live company information to Trey Research, and retrieve the linked customer briefing. The service uses contact company-name resolution; the relationship is not injected from this document.

## 3. Quote preparation

> Prepare a quote for two whiteboards for Adatum Corporation.

Expected behavior: resolve Adatum Corporation; resolve “whiteboards” against Business Central; use the exact returned item number when unambiguous; prepare a quote and show a preview. **No ERP write has occurred yet.** Explicit human confirmation is required.

## 4. Ambiguous item resolution

> Prepare a quote for five white items for Trey Research.

Business Central may return `1996-S — ATLANTA Whiteboard, base` and `SP-BOM3003 — Paint, white`. VOICE2ERP must ask which returned item is meant. Example follow-up:

> The first one.

The agent must use the exact item number belonging to the first candidate in the actual returned list. Search wording and tenant contents can change the result; the two-item example is not a guaranteed exhaustive response. If necessary, ask to search for “white” to demonstrate the native ambiguity path.

## 5. Human-confirmed ERP write

After a preview, review customer, item, quantity, and the reference-price note, then click **Confirm & create** when safely stopped or otherwise appropriate. The application creates the quote, re-reads it and its lines from Business Central, checks the expected fields, and only then reports verified success. If the voice session remains ready, it requests a spoken result too.

Generated document numbers and amounts can vary. A demo write changes the sandbox; subsequent briefings may include the new quote. There is no need for jury members to open the tenant to see the application's returned record number and verification evidence.

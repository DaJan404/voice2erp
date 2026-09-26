# Use cases

[Documentation index](README.md) · [Demo identities](demo-data.md)

## Pre-meeting briefing — CURRENT

“Give me a briefing on Trey Research.”

The agent calls `get_customer_briefing`. The service resolves a customer, reads orders, quotes, and invoices, and returns customer details, sales summaries, recent/largest order context, and receivables evidence. The web application can independently request the briefing for its evidence panel.

The intended setting is preparation between visits, with hands-free conversation only where safe and legal. Retrieved lists are bounded; this is not an exhaustive accounting or sales-history report.

## Contact-to-customer briefing — CURRENT

“I'm meeting Helen Ray. What should I know?”

If customer search finds no match, the service searches contacts and uses their `companyName` values to find customers. A single resolved customer yields the briefing and contact details. Multiple customers require clarification. This is application-level resolution using live ERP records, not a hard-coded Helen-to-Trey mapping in the agent.

## Quote preparation — CURRENT

“Prepare a quote for two whiteboards for Adatum Corporation.”

The agent obtains the customer/contact, item, and positive quantity. `search_items` resolves the wording through Business Central. When unambiguous, the exact item number is used in read-only preparation. The web application separately prepares a token-bearing preview. Nothing is written until **Confirm & create**.

Review while safely stopped or otherwise appropriate. The displayed price is a reference estimate; the final customer-specific price comes from Business Central after creation.

## Ambiguous product — CURRENT

“Prepare a quote for five white items for Trey Research.”

Business Central may return `1996-S — ATLANTA Whiteboard, base` and `SP-BOM3003 — Paint, white`. The agent presents the actual returned candidates and asks for a choice. “The first one” means the first item in that response, not a permanently assigned catalog position. Exact query wording and current records can affect results.

## Post-meeting administration — CURRENT and FUTURE

**CURRENT:** the salesperson can prepare the supported quote after a meeting and confirm it without repeating that request later at a laptop. The verified record number and amount are shown in the web application.

**FUTURE:** saving meeting notes, creating follow-up tasks, emailing a quote, multi-line quote editing, and CRM activity capture are not implemented. They must not be included as successful steps in a current demo.

See the [jury walkthrough](demo-guide.md) for a reproducible evaluation order.

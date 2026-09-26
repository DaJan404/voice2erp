# Problem and vision

[Documentation index](README.md)

A field salesperson moves between customers while ERP work remains tied to screens. Before a meeting, they need current customer context; afterward, they need to translate a conversation into a concrete next action. Returning to a laptop later adds a second round of recalling and entering information.

VOICE2ERP explores whether conversation can prepare that work while preserving deliberate control over ERP writes. The current prototype connects voice to a dedicated Microsoft Dynamics 365 Business Central sandbox.

## A day between visits

After leaving Customer A, the salesperson asks, “Brief me on Customer B.” VOICE2ERP retrieves live customer, sales, and receivables information. The salesperson enters the next meeting with source-backed context. After the meeting, “Prepare a quote for two whiteboards” starts entity resolution and read-only preparation. The proposal waits in the web interface. When safely stopped or otherwise able to review it, the salesperson confirms; the application creates and re-reads the quote.

Hands-free conversation is appropriate only where safe and legal. No part of this concept requires screen interaction while actively driving. A voice request is not permission for a blind ERP mutation.

## Product principles

- **Talk:** the agent interprets language; fresh ERP evidence grounds factual answers.
- **Confirm:** the human reviews the resolved customer, item, and quantity.
- **Execute:** a separate application path authorizes the mutation.
- **Verify:** a successful POST is followed by a fresh read and concrete checks.

Business Central owns business identity and operational values. The LLM does not assign item numbers or manufacture invoice evidence. If a search is ambiguous, the user decides. If available invoices do not explain the customer balance, the system should disclose the mismatch rather than invent a cause.

## Current and future

**CURRENT:** customer/contact briefing, native item resolution, and human-confirmed creation of a single-item quote. The browser shows evidence and transcripts; a connected session can speak the verified result.

**FUTURE:** meeting notes, follow-up task creation, sending documents, richer quote composition, and production user authorization would need separate design and implementation. No measured time saving, adoption, or return on investment is claimed.

See [use cases](use-cases.md) for concrete boundaries and [design decisions](design-decisions.md) for engineering tradeoffs.

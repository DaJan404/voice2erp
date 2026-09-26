# Quote workflow

[Documentation index](README.md)

![Quote sequence](../assets/voice2erp-quote-workflow.svg)

`BC sandbox` in the diagram means the Microsoft Dynamics 365 Business Central demo tenant. The five diagram bands distinguish talk/resolution, read-only preparation, human confirmation, execution, and read-after-write verification. Creating the header and line occurs only after the human confirmation path. Quote and line fetches are shown separately for clarity but run concurrently in the implementation. The diagram shows the successful logical flow. Voice tool execution and browser reactions are separate asynchronous requests; it does not promise that their responses arrive in this exact order. OAuth exchanges are omitted here and shown in [architecture](architecture.md).

## Talk: two read-only preparation paths

The voice agent calls `prepare_sales_quote` with a customer/contact, exact resolved item number, and quantity. Its TOOL credential permits resolution and preview only. The service rejects missing/ambiguous entities, blocked items, and non-finite or out-of-range quantities; supported quantity is greater than zero and at most 10,000.

Separately, the browser sees the preparation tool-call arguments and POSTs them to the Next.js preparation route. Next.js calls the same Worker preparation endpoint with the VERIFY credential. A successful result on this path gains a signed confirmation token with a 600-second lifetime. Both paths resolve records without writing a quote.

The preview contains customer, item, quantity, reference unit price and subtotal, currency, and a price note. It is not a customer-specific final price quotation. The signed fields do not include price or total.

## Confirm: human review

The browser stores the preview and creates a request UUID. **Confirm & create** submits the signed token and that request ID; Cancel clears the prepared action before execution. Review happens when safely stopped or otherwise appropriate, never as an instruction to use a screen while driving.

[Confirmation signing](../src/voice2erp/quotes/confirmation.py) uses HMAC-SHA256 with the execute secret. The payload binds version, customer number, item number, quantity, and expiry. It is signed, not encrypted; it is not a user identity, a single-use token, or a price lock. An expired preview must be prepared again.

## Execute: controlled application path

[Next.js creation proxy](../web/app/api/quotes/create/route.ts) adds `X-VOICE2ERP-EXECUTE-TOKEN` server-side. [The Worker](../src/voice2erp/main.py) enforces POST, validates the credential and signed payload, then passes the signed entity fields to [QuoteService](../src/voice2erp/quotes/service.py).

The service re-fetches the customer/item, checks existence and blocked status, normalizes the request ID, and derives a `V2ERP-` external document marker. It checks for an existing quote before creating a header and one Item line. A successful new result returns `created`; reuse returns `existing`.

## Verify: re-read before success

The service fetches the quote and lines again. It checks that the customer number matches and that at least one line has the requested item number and quantity, within a small numeric tolerance. It reports the amount and document number returned by Business Central. This does not independently validate every line, tax calculation, or price rule.

The UI shows the result and requests a spoken confirmation using these returned facts if the voice session is ready. Read-after-write verification is an application check against fresh ERP data, not an independent external audit system.

## Retry and failure semantics

| Situation | Current behavior / limitation |
| --- | --- |
| Same request marker, matching quote | Re-read and return the existing record |
| Existing marker, no lines | Attempt to add the requested line, then verify |
| Existing marker, different nonempty lines | Reject with a conflict |
| Multiple quotes with the same marker | Client raises an error |
| New line creation fails | Attempt to delete the new header; cleanup can also fail |
| Post-write verification fails | No verified success; a record may nevertheless exist in ERP |
| Concurrent submissions / new request IDs | No atomic lock or uniqueness guarantee; duplicates are possible |

Ordinary sequential retry reuse is tested. Exactly-once delivery is not guaranteed. The marker uses normalized/truncated request-ID characters; the signed token does not bind the request ID. Recovering an uncertain result should start with inspecting the existing ERP record, rather than repeatedly creating fresh previews and new request IDs.

Some UI error wording simplifies failures to “could not create.” That is not proof that nothing was written after a timeout or verification failure. This documentation describes that limitation without changing application behavior.

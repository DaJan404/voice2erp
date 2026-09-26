# Jury demo guide

[Documentation index](README.md) · [Demo catalog](demo-data.md)

## Before presenting

Open the [public application](https://voice2erp.vercel.app), allow microphone access, and start a session in a quiet setting. Direct Business Central tenant access is not required for the jury. A maintainer should confirm that the hosted agent, Worker secrets, Entra application, sandbox, and AL OData service are configured and available before the presentation.

Use hands-free voice only where safe and legal. Perform the entire screen-based demonstration while stationary; a travel story does not require driving during the demo.

## Suggested walkthrough

| Step | Prompt / action | What the jury should observe |
| --- | --- | --- |
| 1 | “Give me a briefing on Trey Research.” | A tool call, concise live briefing, and independently requested ERP evidence in the UI |
| 2 | “I'm meeting Helen Ray. What should I know?” | The linked Trey Research briefing and resolved-contact information |
| 3 | “Prepare a quote for two whiteboards for Adatum Corporation.” | Item resolution and preview; no created document yet |
| 4 | Inspect customer, exact item, quantity, reference price | The distinction between preparation and execution |
| 5 | Click **Confirm & create** | Returned quote number, final ERP amount, and verification metadata after re-reading |
| 6 | Keep the session connected | Requested spoken confirmation grounded in the returned facts |

Demonstrate ambiguity separately with “Prepare a quote for five white items for Trey Research.” Let the agent ask for a choice. Answer “The first one,” then check that the preview uses that returned candidate. You can cancel this preview to avoid an additional write.

Do not promise fixed amounts, document numbers, counts, or a fixed transcript. The catalog supplies identities; the runtime supplies facts.

## Explain the evidence

A spoken statement alone is not the proof of creation. Show the application result returned after the Worker fetched the quote and lines and checked customer, item, and quantity. Customer verification metadata names the source and retrieval time; it is not an independent audit-service certificate. The jury can assess this application evidence without tenant access, while a maintainer can inspect the record in Business Central if further confirmation is needed.

## Recovery during a demo

| Symptom | Next step |
| --- | --- |
| Microphone or session does not start | Check browser permission and voice service configuration; restart the session |
| ERP request fails | Have the maintainer check Worker configuration, Entra/BC access and AL publication; do not substitute invented values |
| No item matches | Clarify the description or use a catalog item number |
| More than one candidate | Choose from the returned list, not from memory of a previous run |
| Confirmation expired | Prepare again and review the new preview |
| Speech is absent after creation | Read the visible verified result; the voice session may no longer be connected |
| Creation/verification errors after confirmation | A partial write may exist. Have the maintainer inspect ERP before trying a fresh request |

The application has no general quote cleanup UI. A maintainer may manage demo records in the sandbox outside this walkthrough. Do not repeatedly confirm fresh previews merely to obtain a particular quote number.

## Evaluation boundaries

The current demo covers briefing, resolution, one-item quote preparation, confirmation and verification. It does not demonstrate meeting-note storage, task creation, email delivery, multi-line editing, production authorization, or exhaustive sales history. Those are separate future possibilities.

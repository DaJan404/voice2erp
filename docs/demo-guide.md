# Jury demo guide

[Documentation index](README.md) · [Demo catalog](demo-data.md)

## Before presenting

Open the [public application](https://voice2erp.vercel.app), allow microphone access, and start a session in a quiet setting. Direct Business Central tenant access is not required for the jury. A maintainer should confirm that the hosted agent, Worker secrets, Entra application, sandbox, and AL OData service are configured and available before the presentation.

Use hands-free voice only where safe and legal. Perform the entire screen-based demonstration while stationary; a travel story does not require driving during the demo.

## Core demo — target 60–90 seconds

The primary walkthrough should show the complete value chain once: live ERP context, voice-driven preparation, explicit human approval, ERP execution, and read-after-write verification.

| Step | Prompt / action | What the jury should observe |
| --- | --- | --- |
| 1 | “Give me a briefing on Trey Research.” | A concise live briefing plus independently requested Business Central evidence in the UI |
| 2 | “Prepare a quote for two whiteboards for Adatum Corporation.” | Business Central item resolution and a read-only quote preview; no document has been created yet |
| 3 | Inspect customer, exact item, quantity, and reference price | The proposal is grounded in resolved ERP records and still requires human approval |
| 4 | Click **Confirm & create** | The application executes the write through the protected server path |
| 5 | Show the returned quote number, final ERP amount, and verification metadata | The Worker has re-read the quote and its lines and checked the expected customer, item, and quantity |
| 6 | Keep the voice session connected | AssemblyAI can speak the verified result returned by the application |

The exact timing depends on network and service latency; the 60–90 second target is a presentation goal, not a runtime guarantee.

Do not promise fixed amounts, document numbers, counts, or a fixed transcript. The demo catalog supplies stable identities; the runtime supplies current business facts.

## Optional deep dives

Use these only if the jury asks about customer resolution, ambiguity, hallucination controls, or the Business Central source-of-truth model.

### Contact-to-customer resolution

Say:

> “I'm meeting Helen Ray. What should I know?”

The service should resolve the contact through live Business Central company information to Trey Research and retrieve the linked customer briefing. This demonstrates that the agent is not using a hard-coded Helen-to-Trey response.

### Ambiguous product resolution

Say:

> “Prepare a quote for five white items for Trey Research.”

Let the agent present the candidates returned by Business Central and ask for a choice. Answer:

> “The first one.”

Then verify that the preview uses the exact first candidate returned in that run. Cancel the preview if you do not want another sandbox write.

This scenario demonstrates a key rule: the language model interprets intent, but Business Central resolves item identity and the human chooses when the ERP result is ambiguous.

## Explain the evidence

A spoken statement alone is not proof of creation. Show the application result returned after the Worker fetched the quote and lines and checked customer, item, and quantity. Customer verification metadata names the source and retrieval time; it is not an independent audit-service certificate.

The jury can evaluate this application evidence without direct tenant access. If deeper verification is needed during development or judging, a maintainer can inspect the sandbox record in Business Central.

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

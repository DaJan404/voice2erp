# Design decisions and future work

[Documentation index](README.md)

The implementation establishes the choices below. The rationale is an engineering interpretation of how those choices support the stated field-sales problem, not a reconstructed record of historical vendor evaluations or benchmark results.

| Decision | Implemented evidence | Rationale and tradeoff |
| --- | --- | --- |
| AssemblyAI voice agent | Audio WebSocket client and three configured HTTP tools | Conversation fits transition-time briefing; depends on network, microphone and a hosted voice service |
| Next.js on Vercel | Browser UI plus server routes | A single web app can show evidence, gather confirmation and keep API keys server-side; no native/offline mobile app is implied |
| Cloudflare Python Worker | Worker entry point and shared Python services | Centralizes token checks and ERP integration behind HTTP tools; introduces a separate deployment boundary |
| Business Central as source of truth | Live REST and OData calls | Keeps identities and business values in the ERP; availability and query limits remain visible constraints |
| Native AL item resolver | Codeunit 50100 | Resolves items where records live; requires extension installation and OData publication |
| No direct voice write tool | Agent exposes only briefing, search, preparation | Separates spoken intent from UI execution; confirmation interrupts a fully hands-free workflow intentionally |
| Signed confirmations | HMAC payload binds entity fields, quantity and expiry | Prevents altering signed fields without the secret; not a user identity, price lock or single-use guarantee |
| Read-after-write verification | Fresh quote/line reads and matching checks | Avoids declaring success based solely on POST; partial writes can still precede a failed verification |
| Request marker | `externalDocumentNumber` lookup and reuse | Supports ordinary sequential retries; lacks atomic concurrency protection |
| ERP secrets outside browser | Worker configuration and Next.js proxies | Limits credential exposure; does not itself provide end-user authorization |

## FUTURE: “Try the demo” panel

A small public-web panel could show supported demo customers, contacts, products, copyable prompts, and an ambiguity example. It would contain discoverability metadata only. It must not feed hard-coded balances, sales values, invoice evidence, prices, or quote results into the voice agent. All operational data must continue to come from Business Central.

This panel is **not implemented** by this documentation task. The current equivalent is the [demo catalog](demo-data.md).

## Other future work

Potential extensions include per-user authentication/authorization, rate limits, durable audit records, stronger concurrent retry handling, paginated reads, AL/transport/browser tests, multi-line quotes, and post-meeting notes or follow-up tasks. Each requires explicit implementation work. Their presence here is not a release commitment or a claim of current production readiness.

## Evidence qualifications

The field-sales benefit is a product hypothesis; no ROI measurements are asserted. The demo identities are owner-confirmed and partly corroborated by source/test fixtures, not independently live-queried during documentation authoring. Provider deployment instructions describe required configuration; the repository cannot prove the current cloud-account settings. Diagrams abstract logical requests and do not depict measured timing.

# Current architecture

[Documentation index](README.md)

![Current runtime](../assets/voice2erp-runtime.svg)

All components in this diagram are implemented. Deployment settings and the existing public demo identify Vercel, Cloudflare, AssemblyAI, and the Business Central sandbox as the intended runtime; this document is not a live service-health attestation.

## Components and responsibilities

| Component | Responsibility | Source |
| --- | --- | --- |
| Browser | Audio capture/playback, WebSocket, transcripts, evidence and confirmation UI | [page](../web/app/page.tsx), [session](../web/lib/voice-agent-session.ts) |
| Next.js server | Mint voice tokens; proxy customer verification, preview preparation and quote execution | [API routes](../web/app/api) |
| AssemblyAI | Conversation, speech, three read-only HTTP tools | [agent specification](../agents/voice2erp.jsonc) |
| Python Worker | Route requests, validate service tokens, call services and attach evidence metadata | [routes](../src/voice2erp/main.py), [entry point](../src/worker.py) |
| Entra ID | Issue an application bearer token using client credentials | [client](../src/voice2erp/business_central/client.py) |
| Business Central | Authoritative customers, contacts, items, documents and pricing | [client](../src/voice2erp/business_central/client.py) |
| AL codeunit | Native item identity resolution through an OData action | [Item Search](../bc-extension/src/Search/ItemSearch.Codeunit.al) |

The runtime entry point is a Cloudflare `WorkerEntrypoint`, not a FastAPI server, even though FastAPI appears among Python dependencies. There is no separate application database or queue in this flow.

## Read and voice paths

1. The browser requests `/api/voice-token` from Next.js.
2. Next.js uses its AssemblyAI API key to mint a token with a requested 60-second TTL.
3. The browser connects directly to AssemblyAI over WSS and selects the configured agent.
4. AssemblyAI calls Worker HTTP tools with the tool token.
5. The Worker obtains an Entra bearer token and reads Business Central. Entra is a token issuer, not a business-data proxy.
6. Tool-call events reach the browser. A briefing call triggers a separate Next.js verification request so the UI can show fresh ERP evidence.

## Two preparation paths

| Path | Worker credential | Result |
| --- | --- | --- |
| AssemblyAI `prepare_sales_quote` | `X-VOICE2ERP-TOKEN` | Read-only preview, without a signed confirmation token |
| Browser → Next.js `POST /api/quotes/prepare` → Worker `GET /api/quotes/prepare` | `X-VOICE2ERP-VERIFY-TOKEN` | Separately resolved preview plus a signed confirmation token |

The browser starts the second path from the voice tool-call arguments. These are separate requests; the UI does not simply trust or reuse an agent's spoken preview. Their timing can overlap, so the sequence diagram shows logical stages rather than strict event scheduling.

After explicit UI confirmation, Next.js forwards the signed token and request ID with its server-side execute credential. The Worker validates, executes, re-reads, and verifies. [Quote workflow](quote-workflow.md) contains the detailed sequence and failure behavior.

## Worker API

| Path | Intended method | Credential / purpose |
| --- | --- | --- |
| `/health` | GET | Public process health response; does not test ERP connectivity |
| `/api/customers/briefing` | GET | TOOL; voice briefing |
| `/api/items/search` | GET | TOOL; native AL search |
| `/api/verify/customer` | GET | VERIFY; fresh briefing plus source metadata |
| `/api/quotes/prepare` | GET | TOOL or VERIFY; signed token only for VERIFY path |
| `/api/quotes/create` | POST | EXECUTE plus signed confirmation and request ID |

These are intended methods. The Worker explicitly enforces POST on creation and GET on item search and quote preparation; briefing, customer verification, and health dispatch by path without an explicit method check. Next.js additionally exposes `/api/voice-token`, `GET /api/verify/customer`, and POST preparation/creation proxies.

## Testing evidence

The tracked suite has 19 test functions, using fake Business Central implementations rather than a live tenant:

| File | What it exercises |
| --- | --- |
| [test_smoke.py](../tests/test_smoke.py) | Six shared token-validator cases: missing/empty configuration, missing/empty/wrong supplied tokens, acceptance |
| [test_briefing.py](../tests/test_briefing.py) | Contact resolution, reconciled invoice evidence, unknown contact |
| [test_quotes.py](../tests/test_quotes.py) | Confirmation round trip, tampering, expiry, preparation, creation/verification and sequential marker reuse |
| [test_item_search.py](../tests/test_item_search.py) | Five Python text-search helper cases; these helpers are not the runtime AL resolver |

There are no tracked browser end-to-end tests, AL test codeunits, or tests of the real Entra/BC transport. Negative verification, concurrent retries, cleanup failure, and browser origin checks are not established by this suite. Lint/build checks do not substitute for those tests. Manual sandbox evaluation is described in the [demo guide](demo-guide.md).

## Evidence and maintenance

The source review used code-review-graph first, then verified implementation and tests. The available graph was built at an older commit and had no community/flow results; its omissions were not treated as absence of code. The previous SVG described an earlier in-memory demo and has been replaced. [Diagram specifications and regeneration](../assets/diagrams/README.md) are version-controlled.

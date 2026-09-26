# VOICE2ERP

**Talk. Confirm. Execute. Verify.**

VOICE2ERP is a voice-first sales assistant for Microsoft Dynamics 365 Business Central. A salesperson can ask for a customer briefing, resolve a product, and prepare a sales quote conversationally. The web application presents the proposal for explicit human confirmation, writes it to Business Central, then re-reads the record before reporting success.

> **Current scope:** a hackathon prototype using a dedicated Business Central sandbox/demo tenant. It is not a production-ready ERP assistant.

[Open the public demo](https://voice2erp.vercel.app) · [Documentation index](docs/README.md) · [Jury demo guide](docs/demo-guide.md)

## The problem: ERP work between customer visits

Salespeople move between meetings; ERP systems are organized around screens, forms, and search fields. Before the next visit they may need customer context, a contact, open sales activity, or receivables evidence. After a meeting they may need to turn a product request into a quote. Deferring that work until they return to a laptop means recalling and entering the same information later.

VOICE2ERP connects that transition time to a controlled ERP workflow:

```text
Customer A → travel / transition → “Brief me on Customer B.”
           → live ERP context → Customer B meeting
           → “Prepare a quote for two whiteboards.”
           → preview → human confirmation → ERP write → re-read and verify
```

Voice interaction is hands-free only where safe and legal. Review the screen and confirm writes when safely stopped, parked, or otherwise appropriate. The project does not propose screen interaction while actively driving.

## Try it yourself

Start the voice session in the [web demo](https://voice2erp.vercel.app) and allow microphone access. These prompts use the project's demo records; you do not need direct access to Business Central.

| Scenario | Say |
| --- | --- |
| Customer briefing | “Give me a briefing on Trey Research.” |
| Contact resolution | “I'm meeting Helen Ray. What should I know?” |
| Quote preparation | “Prepare a quote for two whiteboards for Adatum Corporation.” |
| Ambiguity test | “Prepare a quote for five white items for Trey Research.” |

For an ambiguous result, listen to the returned options and choose one—for example, “The first one.” For a prepared quote, review the customer, item, and quantity before clicking **Confirm & create**. Preparation alone performs no ERP write.

See the [demo catalog](docs/demo-data.md) for stable identities and the [demo guide](docs/demo-guide.md) for expected behavior and troubleshooting. Customer, sales, quote and receivables values are retrieved live from the Business Central demo tenant and may change as the demo is used. Generated document numbers and amounts can vary.

## What is implemented

- Live customer lookup, including contact-to-customer resolution.
- Briefings with customer information, orders, existing quote summaries, and receivables evidence.
- Business Central-native item search, with clarification for ambiguous products.
- Read-only preparation of a single-item sales quote.
- A web preview and explicit human confirmation before execution.
- Creation followed by a fresh read of the quote and its lines.
- A verified result in the interface and a requested spoken response while the voice session is connected.

Example interaction, with live values omitted:

```text
Salesperson: Give me a briefing on Trey Research.
Agent:       [Briefing grounded in current Business Central results.]
Salesperson: Prepare a quote for two whiteboards.
Agent:       [Resolves a real item, prepares the proposal, requests UI review.]
Web app:     Customer + item + quantity + reference price. Confirm & create.
Salesperson: [Reviews and clicks when safely stopped.]
Application: Creates the quote, fetches it again, checks customer/item/quantity.
Agent:       [Reports the returned quote number and verified result.]
```

The wording is illustrative, not a promise of a fixed transcript or amount.

## Why this is more than a conversational wrapper

**The LLM interprets language. Business Central resolves business entities. The human authorizes mutations. The system verifies the result.**

The agent is instructed to retrieve evidence for new factual ERP questions rather than invent records or infer the causes of unpaid balances. Product descriptions are resolved by an AL codeunit inside Business Central. Multiple candidates require a user choice; the agent then uses the exact returned item number.

The voice agent has only three read-only tools: `get_customer_briefing`, `search_items`, and `prepare_sales_quote`. There is no direct create-sales-quote voice tool. These controls reduce reliance on conversational promises, although the prototype does not claim that a language model can never make a factual mistake.

## Current architecture

![Current VOICE2ERP runtime architecture](assets/voice2erp-runtime.svg)

The browser streams audio directly to AssemblyAI using a short-lived token minted through Next.js. AssemblyAI calls the Cloudflare Python Worker's read-only HTTP tools. The Worker authenticates to Microsoft Entra ID, then calls Business Central's standard REST APIs and the native AL OData resolver. Entra issues tokens; it does not proxy ERP traffic.

The separate human-confirmation route goes through the Next.js server. A voice `prepare_sales_quote` event also triggers the web application to re-prepare through the verification-authorized path. Only that path returns the signed confirmation token needed by the UI. See [architecture](docs/architecture.md) and the [quote sequence](docs/quote-workflow.md).

## Talk → Confirm → Execute → Verify

| Stage | Implemented behavior |
| --- | --- |
| Talk | Resolve the customer and item from ERP data; prepare without mutation. |
| Confirm | Review the web preview. A signed token binds customer, item, quantity, and a 10-minute expiry. |
| Execute | Next.js supplies its server-side execute token; the Worker validates the confirmation and writes the quote. |
| Verify | Re-fetch the quote and lines; check customer, item number, and quantity before returning success. |

Preview pricing is a reference estimate. Business Central calculates the final customer-specific amount. A request marker supports ordinary retries; it is not an exactly-once guarantee. Verification is performed by the application against fresh ERP reads, not by an external audit service.

The browser never receives the Business Central client secret, AssemblyAI API key, or `VOICE2ERP_EXECUTE_TOKEN`. It does receive short-lived voice and signed confirmation tokens. [Security and trust](docs/security-and-trust.md) explains these boundaries and the prototype's limitations.

## Technology and repository map

| Area | Technology / source |
| --- | --- |
| Voice agent | AssemblyAI Voice Agent API; [agent configuration](agents/voice2erp.jsonc) |
| Web application | Next.js 16, React 19, TypeScript, Tailwind CSS; [web](web/README.md), deployed on Vercel |
| Application API | Cloudflare Python Worker; [entry point](src/worker.py), [routes](src/voice2erp/main.py) |
| ERP access | Entra OAuth client credentials; [Business Central client](src/voice2erp/business_central/client.py) |
| Item resolution | Business Central AL; [codeunit 50100](bc-extension/src/Search/ItemSearch.Codeunit.al) |
| Quote workflow | [Preparation/execution service](src/voice2erp/quotes/service.py) and [confirmation signing](src/voice2erp/quotes/confirmation.py) |
| Tests | [Python tests](tests); service fakes and focused unit tests |
| Documentation | [docs index](docs/README.md), SVGs in `assets/`, [diagram sources](assets/diagrams/README.md) |

## Run locally

You need Python 3.12+, `uv`, Node.js compatible with the locked Next.js dependencies and selected Wrangler version, and npm. Full voice/ERP operation also needs configured AssemblyAI, Entra, and a Business Central sandbox with the AL service published. It is not an offline fixture demo.

From the repository root:

```bash
uv sync
cp .env.example .dev.vars
# Fill .dev.vars locally with sandbox configuration and service tokens.
npx wrangler dev
```

In a second terminal:

```bash
cd web
npm ci
cp .env.example .env.local
# Set server-side web configuration; use the local Worker URL for API_BASE.
npm run dev
```

Open `http://localhost:3000`. AssemblyAI's hosted HTTP tools cannot reach your localhost Worker: configure a reachable development Worker for those calls, or use the separately configured deployed sandbox Worker. The checked-in agent configuration targets the public Worker. See [deployment](docs/deployment.md) before attempting an end-to-end local session.

## Environment configuration

| Location | Variables |
| --- | --- |
| Worker | `VOICE2ERP_TOOL_TOKEN`, `VOICE2ERP_VERIFY_TOKEN`, `VOICE2ERP_EXECUTE_TOKEN`, `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `BC_ENVIRONMENT`, `BC_COMPANY_ID` |
| Next.js server | `ASSEMBLYAI_API_KEY`, `VOICE2ERP_AGENT_ID`, `VOICE2ERP_API_BASE`, `VOICE2ERP_VERIFY_TOKEN`, `VOICE2ERP_EXECUTE_TOKEN` |
| Hosted agent tools | The matching `VOICE2ERP_TOOL_TOKEN` header value |

Use the committed example files as variable inventories, not credentials. Keep secrets out of Git and out of `NEXT_PUBLIC_*` variables. Cloudflare's local secret file is `.dev.vars`; Next.js uses `web/.env.local`. Provider setup, AL publication, and token ownership are documented in [deployment](docs/deployment.md).

## Testing

```bash
uv run pytest -q
uv run ruff check src tests
cd web
npm run lint
npm run build
```

The tracked Python tests cover token validation, confirmation signing/tampering/expiry, fake-backed briefings, quote preparation, and sequential retry reuse. Item-search tests exercise Python helpers, **not the runtime AL resolver**. There are no tracked browser end-to-end tests or AL resolver tests. The [testing inventory](docs/architecture.md#testing-evidence) distinguishes automated evidence from manual demo validation.

## Scope and next steps

Current behavior creates a single-item draft quote; it does not post invoices, send quotes by email, record meeting notes, or automate general follow-up tasks. Reads are bounded and not a complete paginated sales history. The public demo has service-token separation and selected same-origin checks, but no implemented per-user login/role model. Partial failures can require ERP inspection.

Future ideas include a discoverability-only “Try the demo” panel, broader testing, stronger user authorization, and richer post-meeting workflows. These are proposals, not implemented capabilities. See [design decisions](docs/design-decisions.md), [use cases](docs/use-cases.md), and the [full documentation](docs/README.md).

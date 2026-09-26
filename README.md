# VOICE2ERP

**Talk. Confirm. Execute. Verify.**

VOICE2ERP is a voice-first sales assistant for **Microsoft Dynamics 365 Business Central**. It lets a salesperson ask for live customer information, resolve products naturally by voice, prepare a sales quote, explicitly confirm the write, and verify the resulting Business Central record.

> Hackathon demo: all ERP data comes from a dedicated Business Central sandbox/demo tenant.

## Live demo

- Web app: https://voice2erp.vercel.app
- Backend: Cloudflare Workers
- Voice agent: AssemblyAI Voice Agent API
- ERP: Microsoft Dynamics 365 Business Central

## What it does

VOICE2ERP supports a complete sales workflow:

1. Ask naturally about a customer or contact.
2. Fetch current customer, sales, and receivables data from Business Central.
3. Resolve spoken product descriptions against Business Central-native item search.
4. Ask the user to disambiguate when multiple ERP items match.
5. Prepare a quote without writing anything.
6. Require an explicit human click on **Confirm & create**.
7. Create the quote in Business Central.
8. Re-read the new record and report the verified result back by voice.

Example:

```text
User:
"I'm visiting Adatum Corporation today and I want to prepare
a quote for them with 2 whiteboards."

VOICE2ERP
  -> get_customer_briefing("Adatum Corporation")
  -> search_items("whiteboard")
  -> prepare_sales_quote(
       customer_query="Adatum Corporation",
       item_query="1996-S",
       quantity=2
     )

Web UI:
  -> Quote preview
  -> Human clicks "Confirm & create"

Business Central:
  -> Sales Quote created
  -> Quote re-read and verified

VOICE2ERP:
  -> Speaks the verified quote number, customer, quantity, and total
```

## Why the ERP stays the source of truth

The language model interprets user intent, but it does **not** invent ERP entities.

For item resolution:

```text
Natural language
      |
      v
AssemblyAI agent
      |
      v
Business Central native AL resolver
      |
      +--> resolved   -> exact item number
      |
      +--> ambiguous  -> user chooses a returned candidate
      |
      +--> not_found  -> user is asked to clarify
```

This keeps product identity anchored to actual Business Central records.

## Architecture

<p align="center">
  <img
    src="assets/voice2erp-runtime.svg"
    alt="VOICE2ERP Runtime Architecture"
    width="100%"
  />
</p>

At runtime:

```text
Browser / Next.js on Vercel
        |
        +--> short-lived AssemblyAI voice token
        |
        v
AssemblyAI Voice Agent
        |
        +--> get_customer_briefing
        +--> search_items
        +--> prepare_sales_quote
        |
        v
Cloudflare Python Worker
        |
        +--> Microsoft Entra ID client-credentials auth
        |
        v
Microsoft Dynamics 365 Business Central
        |
        +--> Standard REST APIs
        +--> VOICE2ERP AL item-search codeunit

Human confirmation in web UI
        |
        v
POST /api/quotes/create
        |
        v
Verified Business Central write
```

## Safety and write controls

VOICE2ERP deliberately separates **voice intent** from **ERP mutation**.

- The AssemblyAI agent has no direct write tool.
- Quote preparation is read-only.
- A write requires an explicit human confirmation in the web interface.
- The browser never receives the Business Central credentials or the execute secret.
- Confirmation is bound to a short-lived signed token.
- Quote creation uses an idempotency marker to make ordinary retries safe.
- After creation, the application re-reads the quote from Business Central before claiming success.
- The public demo uses a Business Central sandbox/demo tenant.

## Main components

| Component | Responsibility |
| --- | --- |
| `agents/voice2erp.jsonc` | Voice-agent behavior and tool definitions |
| `web/` | Next.js operator UI, voice session, confirmation workflow |
| `src/voice2erp/main.py` | Cloudflare Worker HTTP API |
| `src/voice2erp/business_central/` | Business Central API integration |
| `src/voice2erp/quotes/` | Quote preparation, confirmation, execution, verification |
| `bc-extension/` | Business Central AL native item resolver |
| `tests/` | Python unit/integration-oriented test coverage |

## Public API surface

The deployed worker exposes the application endpoints used by the voice agent and web frontend:

```text
GET  /health
GET  /api/customers/briefing
GET  /api/items/search
GET  /api/verify/customer
GET  /api/quotes/prepare
POST /api/quotes/create
```

Protected endpoints require server-side tokens. No Business Central client secret is exposed to the browser.

## Local development

### Python / Worker

Requirements:

- Python 3.12+
- `uv`
- Node.js for Wrangler

Install dependencies:

```bash
uv sync
```

Run checks:

```bash
uv run ruff check src tests
uv run pytest -q
```

Run the Cloudflare Worker locally:

```bash
PATH="$PWD/.tooling/node24/bin:$PATH" npx wrangler dev
```

### Web app

```bash
cd web
PATH="$PWD/../.tooling/node24/bin:$PATH" npm install
PATH="$PWD/../.tooling/node24/bin:$PATH" npm run dev
```

Production build:

```bash
PATH="$PWD/../.tooling/node24/bin:$PATH" npm run build
```

## Environment variables

Do not commit secrets.

### Cloudflare Worker

```text
VOICE2ERP_TOOL_TOKEN
VOICE2ERP_VERIFY_TOKEN
VOICE2ERP_EXECUTE_TOKEN

BC_TENANT_ID
BC_CLIENT_ID
BC_CLIENT_SECRET
BC_ENVIRONMENT
BC_COMPANY_ID
```

### Vercel / Next.js

```text
ASSEMBLYAI_API_KEY
VOICE2ERP_AGENT_ID
VOICE2ERP_API_BASE
VOICE2ERP_VERIFY_TOKEN
VOICE2ERP_EXECUTE_TOKEN
```

The Business Central application credentials stay on the Cloudflare Worker and are not required by the Vercel frontend.

## Jury demo flow

A compact end-to-end demo:

```text
1. "Can you give me some information about Trey Research?"
2. Show live Business Central evidence in the UI.
3. "Prepare a quote for two whiteboards."
4. VOICE2ERP resolves the item from Business Central.
5. Show the prepared quote.
6. Click "Confirm & create".
7. Show the new Business Central quote and the spoken verified result.
```

A useful ambiguity demonstration is:

```text
"Prepare a quote for five white items."
```

Business Central may return multiple candidates. VOICE2ERP asks which one the user means instead of guessing.

## Status

The public demo currently supports:

- live customer and contact resolution,
- current sales and receivables briefing,
- Business Central-native item search,
- voice-driven quote preparation,
- human-confirmed quote creation,
- read-after-write verification.


# Voice agent

[Documentation index](README.md)

The [AssemblyAI agent specification](../agents/voice2erp.jsonc) is the checked-in behavior contract. It configures the `anna` voice, greeting, recognition keyterms, system prompt, and three interactive HTTP tools with 10-second tool timeouts.

## Tool contract

| Tool | Inputs | Purpose |
| --- | --- | --- |
| `get_customer_briefing` | `query` | Resolve customer/contact and retrieve current sales/receivables context |
| `search_items` | `query` | Return `resolved`, `ambiguous`, or `not_found` from real ERP items |
| `prepare_sales_quote` | `customer_query`, `item_query`, `quantity` | Validate and prepare without a write; use a resolved exact item number |

Each tool calls the Cloudflare Worker with `X-VOICE2ERP-TOKEN`. The `${VOICE2ERP_TOOL_TOKEN}` placeholder must be resolved in hosted agent configuration; do not publish a populated agent file. There is deliberately no create-sales-quote voice tool.

## Grounding rules

For new factual ERP questions, retrieve current evidence. Do not invent customers, products, invoice explanations, or document numbers. Distinguish an invoice-evidence gap from a known cause of nonpayment. When multiple items match, present the actual candidates in returned order and ask the user to choose. An ordinal follow-up selects that returned candidate's exact number. Preparation must never be described as a completed write.

Demo names in recognition keyterms improve recognition; they are not an ERP database. The [demo catalog](demo-data.md) is for people evaluating the project and is not loaded as operational agent data.

## Browser conversation

The [session implementation](../web/lib/voice-agent-session.ts) obtains a token through Next.js, captures microphone audio with Web Audio worklets, and opens `wss://agents.assemblyai.com/v1/ws`. It sends `session.update` with the agent ID and `input.audio` frames. Incoming transcript, speech, reply audio, and tool-call events drive the UI. Stopping a session cleans up audio resources and requests session termination.

A `tool.call` for a briefing triggers independent UI verification. A quote-preparation event triggers the separate server-proxied preparation path for a signed confirmation token. See [architecture](architecture.md).

After verified execution, the UI sends `reply.create` instructions containing returned ERP facts. This requests a concise spoken confirmation; it requires a connected, ready voice session. The visible result is still available if speech cannot be requested. This is model-generated speech grounded in the application result, not an external audit channel.

## Deployment boundary

The AssemblyAI API key stays on the Next.js server. The browser receives a short-lived session token. The tool token belongs in the hosted agent's server-side HTTP configuration and the Worker. Updating the local JSONC alone does not update a hosted agent. See [deployment](deployment.md).

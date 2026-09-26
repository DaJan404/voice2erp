# VOICE2ERP web application

Next.js provides the browser voice session, live ERP evidence panel, quote preview and explicit confirmation UI. Server routes mint AssemblyAI session tokens and proxy verification/preparation/execution to the Cloudflare Worker.

Start with the [project README](../README.md), [deployment instructions](../docs/deployment.md), and [architecture](../docs/architecture.md).

## Local development

```bash
npm ci
cp .env.example .env.local
# Populate the server-side values locally.
npm run dev
```

Open `http://localhost:3000`. Hosted voice tools need a Worker reachable from AssemblyAI; a local web page alone does not redirect those tools to localhost.

## Checks

```bash
npm run lint
npm run build
```

The package has no automated browser-test script. Build and lint do not validate a live voice or ERP session.

## Server-side configuration

Use `ASSEMBLYAI_API_KEY`, `VOICE2ERP_AGENT_ID`, `VOICE2ERP_API_BASE`, `VOICE2ERP_VERIFY_TOKEN`, and `VOICE2ERP_EXECUTE_TOKEN`. None should be exposed through `NEXT_PUBLIC_*`. Business Central credentials belong only in the Worker.

The browser receives a short-lived voice token and may receive a signed quote confirmation token. It never receives the AssemblyAI API key or execute secret. See [security and trust](../docs/security-and-trust.md).

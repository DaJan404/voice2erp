# Setup and deployment

[Documentation index](README.md)

This is a multi-service sandbox prototype. Local unit tests do not require an ERP tenant, but a real voice session does. No deployment or cloud-account changes are performed by following the documentation review itself.

## Prerequisites

- Python 3.12+ and `uv` for the Python project; Node.js and npm for Next.js and Wrangler.
- A Business Central sandbox compatible with the [AL manifest](../bc-extension/app.json), an Entra application, and permission to install/publish the extension.
- An AssemblyAI account with Voice Agent API access and a hosted agent.
- Cloudflare and Vercel projects for a publicly reachable deployment.

The repository locks Python and web dependencies, but does not pin a root Wrangler npm package. The previous README's `.tooling/node24` path was a local convenience, not a portable prerequisite. Use a supported Node release and record your actual Wrangler version when troubleshooting.

## 1. Provision the Business Central integration

Register an Entra application and configure Business Central application API access (`API.ReadWrite.All`) with tenant-admin consent. Register/enable the application in Business Central and assign permission sets appropriate to the required customer/contact/item/document operations and codeunit execution. Use a dedicated sandbox and do not treat broad administrator permissions as a deployment requirement. The exact tenant permission assignments are not version-controlled here. See Microsoft's [service-to-service authentication instructions](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication).

Compile/install the AL extension using compatible Business Central AL tooling. Publish codeunit 50100, `Item Search`, as a web service named `VOICE2ERP_Search`, matching the client's expected `VOICE2ERP_Search_SearchItems` OData action. Verify that the service is enabled and accessible to the application identity. Source presence and a bundled `.app` do not establish that a tenant has the current code installed.

Record tenant ID, client ID, client secret, environment name and company ID in the Worker's secret store. Never put populated credentials into the repository.

## 2. Configure the Worker

[wrangler.jsonc](../wrangler.jsonc) selects `src/worker.py`, enables Python Workers, and lists eight required configuration values:

| Variable | Purpose |
| --- | --- |
| `VOICE2ERP_TOOL_TOKEN` | Shared credential for hosted voice tools |
| `VOICE2ERP_VERIFY_TOKEN` | Shared credential for Next.js verification and token-bearing preparation |
| `VOICE2ERP_EXECUTE_TOKEN` | Shared execution credential and HMAC confirmation-signing secret |
| `BC_TENANT_ID` | Entra/Business Central tenant |
| `BC_CLIENT_ID` | Integration application |
| `BC_CLIENT_SECRET` | Application credential |
| `BC_ENVIRONMENT` | Sandbox environment name |
| `BC_COMPANY_ID` | Business Central company GUID |

Choose separate strong values for the three service tokens; share each only with its intended server-side consumer. For local development:

```bash
uv sync
cp .env.example .dev.vars
# Populate .dev.vars privately.
npx wrangler dev
```

`.dev.vars` is ignored. The root `.env.example` is a variable inventory, not automatic proof that secrets have been loaded. Cloudflare documents [local secret loading and deployed secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

The commands above preserve this repository's existing Wrangler workflow. Cloudflare's current Python guidance uses `pywrangler`; it is not a declared project dependency here. Consult the [Python Workers guide](https://developers.cloudflare.com/workers/languages/python/) if your Wrangler release requires that launcher. Do not silently replace the deployment toolchain while debugging documentation.

For a deployment you administer, configure all eight values as Cloudflare secrets and deploy the Worker with the selected compatible tooling. For example, Wrangler provides interactive secret input:

```bash
npx wrangler secret put VOICE2ERP_TOOL_TOKEN
# Repeat for the other required variable names; input values privately.
npx wrangler deploy
```

Use your own Worker deployment when forking. The checked-in worker name and agent URLs describe the original demo. `GET /health` only proves that the request handler responds; it does not validate credentials or Business Central availability.

## 3. Configure the hosted voice agent

Use [agents/voice2erp.jsonc](../agents/voice2erp.jsonc) as the source for the hosted agent's prompt, voice, recognition keyterms and HTTP tools. Set each tool URL to the reachable Worker for your environment. Supply the matching TOOL credential privately in its HTTP header configuration; a literal unresolved `${VOICE2ERP_TOOL_TOKEN}` is not a working credential.

Store the hosted agent ID and AssemblyAI API key in the Next.js server environment. The browser integration obtains a temporary token through the server, consistent with [AssemblyAI's browser-integration guide](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration).

There is no committed provisioning script that automatically synchronizes the local agent file with AssemblyAI. Keep the deployed agent and repository definition aligned explicitly.

## 4. Run or deploy Next.js

```bash
cd web
npm ci
cp .env.example .env.local
# Populate .env.local privately.
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `ASSEMBLYAI_API_KEY` | Server-side temporary voice-token minting |
| `VOICE2ERP_AGENT_ID` | Hosted voice agent selection |
| `VOICE2ERP_API_BASE` | Worker origin for Next.js proxies |
| `VOICE2ERP_VERIFY_TOKEN` | Must match Worker's verification credential |
| `VOICE2ERP_EXECUTE_TOKEN` | Must match Worker's execution credential |

Open `http://localhost:3000`. On Vercel, use `web` as the project root, the Next.js framework preset, and configure these server-side variables for the intended deployment environment. Build uses `npm run build`. Do not use `NEXT_PUBLIC_*` for any of these secrets. Business Central credentials are not needed on Vercel.

## Local versus hosted tool traffic

Changing `VOICE2ERP_API_BASE` affects Next.js proxies, not AssemblyAI's configured HTTP tool URLs. Hosted AssemblyAI cannot call your localhost. For an end-to-end development session, use a publicly reachable development Worker and point both paths at the same sandbox configuration. A local browser can still use that hosted integration. Avoid mixing voice data from one environment with confirmation against another.

## Checks and operational boundaries

```bash
uv run pytest -q
uv run ruff check src tests
cd web
npm run lint
npm run build
```

The Next.js build may need network access to retrieve the fonts configured in `app/layout.tsx`. A build failure from blocked font downloads is not an ERP test result. Run the [demo guide](demo-guide.md) manually to validate deployed integration. Check previews before confirming; writes change sandbox records. Uncertain write outcomes need ERP inspection, as described in [quote workflow](quote-workflow.md).

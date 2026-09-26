# Security and trust

[Documentation index](README.md)

![Trust boundaries](../assets/voice2erp-trust-boundaries.svg)

Each service box is a separate trust boundary. In the diagram, TOOL, VERIFY, and EXECUTE abbreviate the corresponding `VOICE2ERP_*_TOKEN` credentials. ERP access credentials exist only in the Worker; the short-lived browser tokens are distinct from these server-side secrets.

## Credential ownership

| Value | Where it belongs | Browser receives it? |
| --- | --- | --- |
| `BC_CLIENT_SECRET` and ERP client configuration | Cloudflare Worker | No client secret; some source metadata such as company/environment is returned |
| Entra ERP bearer token | Worker client | No |
| `ASSEMBLYAI_API_KEY` | Vercel / Next.js server | No |
| `VOICE2ERP_TOOL_TOKEN` | Hosted AssemblyAI tool configuration and Worker | No |
| `VOICE2ERP_VERIFY_TOKEN` | Next.js server and Worker | No |
| `VOICE2ERP_EXECUTE_TOKEN` | Next.js server and Worker; also signs confirmations | No |
| AssemblyAI session token | Minted server-side; supplied to browser | Yes; requested TTL 60 seconds |
| Signed quote confirmation token | Issued by Worker through verification preparation | Yes; 10-minute validity |

These are locations and variable names, never real secret values. Source metadata is not a credential. A signed confirmation is readable and must not be described as encrypted.

## Implemented controls

- Shared service-token comparison uses `hmac.compare_digest` and fails closed when the expected secret is absent.
- Voice tools expose preparation and reads, not quote execution.
- Execution requires the separate execute credential and a valid signed confirmation payload.
- The web UI requires explicit confirmation and disables its confirmation control while execution is underway.
- Voice-token, quote-preparation, and quote-creation routes apply [browser origin/site checks](../web/lib/trusted-browser-request.ts).
- Worker and proxy responses use `Cache-Control: no-store`; browser/Next.js fetches on these paths disable caching. This does not assert a cache directive on every Worker-to-ERP request.
- Fresh ERP reads verify customer/item/quantity before successful execution is reported.

## What these controls do not establish

Same-origin checks reduce cross-site browser request exposure; they are not login, authorization, a user audit trail, or proof that a particular person clicked. The customer verification proxy does not use the same browser-request helper. There is no implemented per-user role model, production tenant isolation layer, or rate-limiting system in the checked-in application.

Confirmation signatures bind selected fields and expiry, not a user identity, final amount, or one-time execution. Marker-based retry handling is not atomic exactly-once delivery. A partial write can survive an error. See [quote workflow](quote-workflow.md).

Prompt instructions require factual grounding, but they are not a mathematical guarantee against hallucination. Audio goes to AssemblyAI; tool results contain ERP data used in conversation; the UI shows customer and transaction evidence. No broader vendor retention or compliance claim is made by this repository.

## Operational handling

Use a dedicated sandbox for the public demo. Keep actual secrets in provider secret stores or ignored local files; never paste them into screenshots, documentation, diagram specifications, browser-prefixed environment variables, or committed agent configuration. Rotate credentials through the relevant provider and update each matching server-side consumer. Review logs before sharing them: underlying integration errors can contain upstream response details.

Production authentication, granular permissions, rate limits, stronger replay/concurrency controls, and durable auditing are **FUTURE** work, not current assurances.

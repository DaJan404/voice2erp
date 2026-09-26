# Reproducible VOICE2ERP diagram set

[Documentation index](../../docs/README.md)

The five diagrams answer different questions. All technical diagrams describe the implemented sandbox system; the field-sales comparison is an illustrative product scenario, not a measured productivity result.

| Layer | Specification | Published SVG | Main location |
| --- | --- | --- | --- |
| Product journey | [field-sales-flow.architecture.json](field-sales-flow.architecture.json) | [Field-sales comparison](../voice2erp-field-sales-flow.svg) | README problem section; problem and vision |
| Hero overview | [system-overview.architecture.json](system-overview.architecture.json) | [System overview](../voice2erp-system-overview.svg) | README solution section; architecture |
| Runtime internals | [runtime.architecture.json](runtime.architecture.json) | [Runtime](../voice2erp-runtime.svg) | README architecture section; detailed architecture |
| Quote lifecycle | [quote-workflow.sequence.json](quote-workflow.sequence.json) | [Quote sequence](../voice2erp-quote-workflow.svg) | Quote workflow |
| Credential ownership | [trust-boundaries.architecture.json](trust-boundaries.architecture.json) | [Trust boundaries](../voice2erp-trust-boundaries.svg) | Security and trust |

The product comparison uses Archify's architecture renderer for two parallel top-to-bottom journeys. Its boxes are activities, not deployed services. The other architecture diagrams use boundaries for service ownership and a security boundary for human confirmation. Unlabeled product/person-to-browser arrows mean only the sequence already stated by their endpoint labels; they carry no hidden protocol or authorization meaning.

## Source evidence

| Diagram statements | Source |
| --- | --- |
| Browser audio/session, transcripts, evidence and quote UI | [page](../../web/app/page.tsx), [voice session](../../web/lib/voice-agent-session.ts) |
| Voice-token minting, verification, prepare and create proxies | [Next.js routes](../../web/app/api) |
| Three read-only HTTP tools and no direct voice mutation | [Agent configuration](../../agents/voice2erp.jsonc) |
| Worker routing, service tokens and two preparation paths | [Worker routes](../../src/voice2erp/main.py), [token validation](../../src/voice2erp/security.py) |
| Briefing, execution and result checks | [BriefingService](../../src/voice2erp/briefing/service.py), [QuoteService](../../src/voice2erp/quotes/service.py) |
| Signed confirmation payload and expiry checks | [Confirmation code](../../src/voice2erp/quotes/confirmation.py) |
| Entra token issuer; direct REST/OData requests | [BusinessCentralClient](../../src/voice2erp/business_central/client.py) |
| Native AL item resolution | [Item Search codeunit](../../bc-extension/src/Search/ItemSearch.Codeunit.al) |

The hero's lower-right path summarizes the confirmed write outcome. The Worker performs the write, re-reads the quote and lines, and checks returned facts; that panel is not another service. Internal boxes list responsibilities, not separately deployed microservices. Runtime arrows show selected cross-boundary paths, not every call or return.

The quote sequence preserves both preparation requests. The browser tool-call event can arrive before the voice tool response. The two post-write GETs are concurrent in `asyncio.gather`; their separate arrows do not assert sequential execution. The verification label on the return means checks complete before the application returns success. `BC sandbox` means the Microsoft Dynamics 365 Business Central demo tenant. TOOL/VERIFY/EXECUTE abbreviate the three `VOICE2ERP_*_TOKEN` credentials.

## Regenerate

These sources use Archify skill version 2.17 and its **showcase** quality profile. Use that version for consistent rendering, Node.js 18+, Playwright and a compatible Chromium/Chrome installation. These are documentation tools, not application runtime dependencies.

[regenerate.mjs](regenerate.mjs) invokes validated Archify delivery for each source, opens the temporary HTML, and uses Archify's native SVG export. It normalizes trailing whitespace only. No generated SVG is hand-edited.

```bash
node assets/diagrams/regenerate.mjs \
  --archify /path/to/archify/bin/archify.mjs \
  --playwright /path/to/node_modules/playwright \
  --chrome /path/to/chrome
```

Omit `--chrome` to use Playwright's installed Chromium, or `--playwright` if the package is resolvable normally. The command prints a temporary review directory containing deterministic delivery receipts, browser-check results, and SVG screenshots. The two new diagrams and all three revised diagrams are generated in one run.

## Validate and inspect

Each Archify delivery must pass all nine artifact checks and report zero showcase composition errors/warnings. To check a source independently:

```bash
node /path/to/archify/bin/archify.mjs validate architecture \
  assets/diagrams/system-overview.architecture.json --quality showcase --json
node /path/to/archify/bin/archify.mjs validate sequence \
  assets/diagrams/quote-workflow.sequence.json --quality showcase --json
```

The regeneration script browser-checks the **actual published SVGs** at 900px (README reading width) and 1440px (large display width), in light and dark themes. It checks image loading, horizontal containment, text bounds and a minimum projected text size of 8px. It saves all 20 full-page screenshots for perceptual inspection; passing a geometry check is not a substitute for looking at them.

These are documentation images with a vertical reading direction. They may scroll vertically inside a documentation page; no clipping, forced height, or internal scroll panel is used to counterfeit a viewport-fit result. Temporary Archify HTML viewers are authoring intermediates, not delivered standalone presentations. Archify's optional `visual-check <temporary.html> --json` tests that different, first-screen HTML-viewer contract; it is not the SVG embedding check above.

Before publishing:

- Check human confirmation is visually distinct and precedes mutation.
- Keep Entra as a token issuer, never an ERP traffic proxy.
- Preserve both preparation paths and concurrent post-write reads.
- Show all server-only credentials without values, and distinguish browser tokens from secrets.
- Inspect all light/dark SVGs at reading width, including group headings and long tool names.
- Verify README and documentation links and compare labels to source again.

Only specifications, this guide, the regeneration script and published SVGs are version-controlled. Review screenshots and temporary HTML remain outside the repository.

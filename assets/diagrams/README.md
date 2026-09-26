# Reproducible VOICE2ERP diagrams

[Documentation index](../../docs/README.md)

These specifications describe the implemented runtime, not future features. They replace the old in-memory-demo architecture. Sources were checked against the Worker routes, Business Central client, AL codeunit, browser session and Next.js proxies.

| Specification | Published SVG |
| --- | --- |
| [runtime.architecture.json](runtime.architecture.json) | [Runtime](../voice2erp-runtime.svg) |
| [quote-workflow.sequence.json](quote-workflow.sequence.json) | [Quote sequence](../voice2erp-quote-workflow.svg) |
| [trust-boundaries.architecture.json](trust-boundaries.architecture.json) | [Trust boundaries](../voice2erp-trust-boundaries.svg) |

## Regenerate

The diagrams were authored with Archify skill version 2.17. Use that version for consistent rendering, Node.js 18+, Playwright and a compatible Chromium/Chrome installation. These are documentation tools, not application runtime dependencies.

[regenerate.mjs](regenerate.mjs) invokes Archify's showcase delivery checks, opens the temporary HTML in a browser, uses its native SVG export, checks canonical export state, and renders the actual SVG in both color schemes. It only normalizes exporter trailing whitespace; geometry and styles come from the native export. Point the arguments to your own installations:

```bash
node assets/diagrams/regenerate.mjs \
  --archify /path/to/archify/bin/archify.mjs \
  --playwright /path/to/node_modules/playwright \
  --chrome /path/to/chrome
```

Omit `--chrome` to use Playwright's installed Chromium. Omit `--playwright` if the package is resolvable normally. Temporary HTML, screenshots and delivery receipts are written outside the repository; the command prints their directory. Only specifications, this guide, the regeneration script and published SVGs are version-controlled. Standalone HTML is useful for authoring inspection but adds no necessary documentation deliverable here.

For each generated temporary HTML, run:

```bash
node /path/to/archify/bin/archify.mjs visual-check /temporary/output/runtime.html --json
```

Repeat for `trust-boundaries.html` and `quote-workflow.html`. Archify's browser check measures four desktop viewports and captures both themes. A successful deterministic delivery is distinct from successful browser measurements and from perceptual review. Inspect the actual SVG screenshots too; do not claim visual review from validator output alone.

## Review checklist

- Confirm the runtime still calls Entra for tokens and Business Central directly for data.
- Keep the voice read-only preparation separate from web preparation that issues confirmation tokens.
- Keep browser session/confirmation tokens distinct from server-side TOOL, VERIFY and EXECUTE secrets.
- Confirm the quote flow re-fetches and checks ERP records before returning success.
- Preserve label readability, arrow direction and service boundaries in both themes.
- Re-run validation after specification changes. Never patch the SVG independently of its source.

The sequence combines proxy return hops into labels marked “Via Vercel” and collapses repeated ERP reads. It shows logical stages, not measured timing or strict scheduling of the two concurrent preparation paths. Runtime arrows denote request initiation; responses are omitted for clarity. In trust labels, TOOL/VERIFY/EXECUTE mean the three `VOICE2ERP_*_TOKEN` names. The diagram's Entra/BC configuration refers to the demo integration, not all credentials held by those external providers.

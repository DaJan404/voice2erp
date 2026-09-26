// Documentation tooling only. Uses Archify's validated delivery and native SVG export.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const archify = option('--archify');
if (!archify) throw new Error('Supply --archify /path/to/archify/bin/archify.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(option('--playwright') || 'playwright');
const here = dirname(fileURLToPath(import.meta.url));
const outputDir = mkdtempSync(join(tmpdir(), 'voice2erp-diagrams-'));
const diagrams = [
  ['architecture', 'system-overview', 'voice2erp-system-overview'],
  ['architecture', 'field-sales-flow', 'voice2erp-field-sales-flow'],
  ['architecture', 'runtime', 'voice2erp-runtime'],
  ['architecture', 'trust-boundaries', 'voice2erp-trust-boundaries'],
  ['sequence', 'quote-workflow', 'voice2erp-quote-workflow'],
];
const receipts = [];
const browserChecks = [];
const browser = await chromium.launch({
  headless: true,
  ...(option('--chrome') ? { executablePath: option('--chrome') } : {}),
});
try {
  for (const [type, name, output] of diagrams) {
    const source = join(here, `${name}.${type}.json`);
    const html = join(outputDir, `${name}.html`);
    const result = spawnSync(process.execPath, [resolve(archify), 'deliver', type, source, html, '--quality', 'showcase', '--json'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    const receipt = JSON.parse(result.stdout);
    const page = await browser.newPage({ viewport: { width: 960, height: 1000 }, colorScheme: 'light' });
    await page.goto(pathToFileURL(html).href);
    await page.locator('#btn-export').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button[data-format="svg"]').click();
    const download = await downloadPromise;
    const svg = resolve(here, '..', `${output}.svg`);
    await download.saveAs(svg);
    // Normalize only trailing whitespace emitted by the native exporter.
    writeFileSync(svg, readFileSync(svg, 'utf8').split('\n').map(line => line.trimEnd()).join('\n').trimEnd() + '\n');
    const canonical = await page.locator('html').getAttribute('data-last-export-canonical');
    if (canonical !== 'true') throw new Error('Noncanonical SVG export: ' + name);
    const wrapper = join(outputDir, `${name}-svg.html`);
    writeFileSync(wrapper, `<html><body style="margin:0"><img style="display:block;width:100%" src="${pathToFileURL(svg).href}"></body></html>`);
    await page.goto(pathToFileURL(wrapper).href);
    const svgText = readFileSync(svg, 'utf8');
    if (/<script\b/i.test(svgText)) throw new Error('Unexpected script in exported SVG');
    for (const width of [900, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        const measurement = await page.evaluate(({ svgText, width }) => {
          const image = document.querySelector('img');
          const probe = document.createElement('div');
          probe.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;width:' + width + 'px';
          probe.innerHTML = svgText;
          document.body.append(probe);
          const svg = probe.querySelector('svg');
          svg.style.width = '100%';
          svg.style.height = 'auto';
          const box = svg.viewBox.baseVal;
          const scale = width / box.width;
          const text = [...svg.querySelectorAll('text')];
          const minTextPx = Math.min(...text.map(node => parseFloat(getComputedStyle(node).fontSize) * scale));
          const clipped = text.filter(node => {
            const r = node.getBBox();
            return r.x < box.x - 1 || r.x + r.width > box.x + box.width + 1 || r.y < box.y - 1 || r.y + r.height > box.y + box.height + 1;
          }).map(node => node.textContent);
          probe.remove();
          return { width, loaded: image.complete && image.naturalWidth > 0,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            minimumTextPx: minTextPx, clippedText: clipped };
        }, { svgText, width });
        const passed = measurement.loaded && !measurement.horizontalOverflow && !measurement.clippedText.length && measurement.minimumTextPx >= 8;
        browserChecks.push({ name, theme, ...measurement, passed });
        if (!passed) throw new Error('SVG browser check failed: ' + JSON.stringify(browserChecks.at(-1)));
        await page.screenshot({ path: join(outputDir, `${name}.${width}.${theme}.png`), fullPage: true });
      }
    }
    receipts.push({ name, ...receipt, svg, canonical });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(outputDir, 'browser-checks.json'), JSON.stringify(browserChecks, null, 2) + '\n');
writeFileSync(join(outputDir, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
console.log(`SVGs exported. Review screenshots and receipts in ${outputDir}`);

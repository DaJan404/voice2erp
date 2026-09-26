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
  ['architecture', 'runtime', 'voice2erp-runtime'],
  ['architecture', 'trust-boundaries', 'voice2erp-trust-boundaries'],
  ['sequence', 'quote-workflow', 'voice2erp-quote-workflow'],
];
const receipts = [];
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' });
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
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.screenshot({ path: join(outputDir, `${name}.${theme}.png`), fullPage: true });
    }
    const svgText = readFileSync(svg, 'utf8');
    if (/<script\b/i.test(svgText)) throw new Error('Unexpected script in exported SVG');
    receipts.push({ name, ...receipt, svg, canonical });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(outputDir, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
console.log(`SVGs exported. Review screenshots and receipts in ${outputDir}`);

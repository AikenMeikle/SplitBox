#!/usr/bin/env node
/**
 * SplitBox Offline Brand Logo Rasterizer (`scripts/render-logos.mjs`)
 *
 * Converts all 5 SplitBox SVG brand concepts into crisp 2x HiDPI PNG assets:
 *   - `public/assets/logos/<slug>/logo.svg` -> `public/assets/logos/renderings/<slug>-logo.png` (1200x400)
 *   - `public/assets/logos/<slug>/icon.svg` -> `public/assets/logos/renderings/<slug>-icon.png` (400x400)
 *   - Combined 5-up Brand Identity Comparison Sheet -> `public/assets/logos/renderings/splitbox-5-logos-sheet.png` (2720x1920)
 *
 * 100% Offline Execution:
 *   - Bundles local `@fontsource` Space Grotesk, Plus Jakarta Sans, and JetBrains Mono `.woff2`
 *     binaries directly as in-memory `data:font/woff2;base64,...` `@font-face` rules so `<text>`
 *     elements inside SVGs render in exact SplitBox typography with zero network calls.
 *   - Uses local headless Google Chrome / Chromium with isolated temporary `--user-data-dir` profiles
 *     and verifies PNG magic bytes (`89 50 4E 47`) + IHDR dimensions on every output file.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LOGOS_ROOT = path.join(ROOT_DIR, 'public', 'assets', 'logos');
const DEFAULT_OUT_DIR = path.join(LOGOS_ROOT, 'renderings');
const BASELINE_LOGO_SVG = path.join(ROOT_DIR, 'public', 'assets', 'splitbox-logo.svg');
const BASELINE_ICON_SVG = path.join(ROOT_DIR, 'public', 'assets', 'splitbox-icon.svg');

export const CONCEPTS = [
  {
    slug: '01-radial-citrus-meter',
    number: '01',
    name: 'The Radial SliceMeter Seal',
    tagline: '4/4 SLICE LOCK · £ WHOLESALE',
  },
  {
    slug: '02-isometric-split-crate',
    number: '02',
    name: 'The Isometric Split-Crate',
    tagline: 'WHOLESALE CASE · SPLIT 4 WAYS',
  },
  {
    slug: '03-perforated-drop-stamp',
    number: '03',
    name: 'The Perforated Drop Ticket',
    tagline: 'BOX DROP · £0.00 CRATE FEE',
  },
  {
    slug: '04-interlocking-s-monogram',
    number: '04',
    name: 'The Modular S-Box Monogram',
    tagline: 'PRE-AUTH SLICE LOCK · GBP £',
  },
  {
    slug: '05-campus-coop-crest',
    number: '05',
    name: 'The Campus Citrus-Crate Co-op Stamp',
    tagline: 'CAMPUS CO-OP · UOB DROP #01',
  },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChromeBinary() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'No local Chrome/Chromium binary found. Checked: ' + CHROME_CANDIDATES.join(', ')
  );
}

/**
 * Loads local `@fontsource` woff2 subsets (`latin` + `latin-ext`) and builds
 * self-contained `@font-face` CSS rules so headless rendering uses exact SplitBox fonts.
 */
export function buildEmbeddedFontFaceCss() {
  const fontSpecs = [
    { pkg: 'space-grotesk', family: 'Space Grotesk', weights: [500, 600, 700] },
    { pkg: 'plus-jakarta-sans', family: 'Plus Jakarta Sans', weights: [500, 600, 700] },
    { pkg: 'jetbrains-mono', family: 'JetBrains Mono', weights: [500, 600, 700] },
  ];
  const subsets = ['latin-ext', 'latin'];
  const rules = [];

  for (const spec of fontSpecs) {
    for (const weight of spec.weights) {
      for (const subset of subsets) {
        const woff2Path = path.join(
          ROOT_DIR,
          'node_modules',
          '@fontsource',
          spec.pkg,
          'files',
          `${spec.pkg}-${subset}-${weight}-normal.woff2`
        );
        if (!fs.existsSync(woff2Path)) continue;
        const b64 = fs.readFileSync(woff2Path).toString('base64');
        rules.push(
          `@font-face {\n` +
            `  font-family: '${spec.family}';\n` +
            `  font-style: normal;\n` +
            `  font-weight: ${weight};\n` +
            `  font-display: block;\n` +
            `  src: url('data:font/woff2;base64,${b64}') format('woff2');\n` +
            `}`
        );
      }
    }
  }
  return rules.join('\n');
}

function cleanInlineSvg(rawSvg) {
  return rawSvg
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readPngMetadata(pngPath) {
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Expected PNG was not created: ${pngPath}`);
  }
  const buf = fs.readFileSync(pngPath);
  if (buf.length < 24) {
    throw new Error(`PNG too small (${buf.length} bytes): ${pngPath}`);
  }
  const magicHex = buf.subarray(0, 8).toString('hex');
  if (magicHex !== '89504e470d0a1a0a') {
    throw new Error(`Invalid PNG magic bytes (${magicHex}) in ${pngPath}`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { bytes: buf.length, width, height };
}

async function renderHtmlToPng({
  chromeBin,
  html,
  outPath,
  cssWidth,
  cssHeight,
  scaleFactor = 2,
}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-logo-render-'));
  const htmlPath = path.join(tmpDir, 'stage.html');
  const profileDir = path.join(tmpDir, 'chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-extensions',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--user-data-dir=${profileDir}`,
      `--window-size=${cssWidth},${cssHeight}`,
      `--force-device-scale-factor=${scaleFactor}`,
      '--virtual-time-budget=400',
      `--screenshot=${outPath}`,
      `file://${htmlPath}`,
    ];

    await execFileAsync(chromeBin, args, { timeout: 30000 });

    const meta = readPngMetadata(outPath);
    const expectedWidth = cssWidth * scaleFactor;
    const expectedHeight = cssHeight * scaleFactor;
    if (meta.width !== expectedWidth || meta.height !== expectedHeight) {
      throw new Error(
        `Dimension mismatch for ${path.basename(outPath)}: got ${meta.width}x${meta.height}, expected ${expectedWidth}x${expectedHeight}`
      );
    }
    return meta;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function buildSingleSvgStageHtml({ fontCss, svgMarkup, cssWidth, cssHeight, bgColor = 'transparent' }) {
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <style>
    ${fontCss}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${cssWidth}px;
      height: ${cssHeight}px;
      overflow: hidden;
      background: ${bgColor};
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    .svg-stage {
      width: ${cssWidth}px;
      height: ${cssHeight}px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .svg-stage > svg {
      width: 100% !important;
      height: 100% !important;
      max-width: ${cssWidth}px;
      max-height: ${cssHeight}px;
      display: block;
    }
  </style>
</head>
<body>
  <div class="svg-stage">${cleanInlineSvg(svgMarkup)}</div>
</body>
</html>`;
}

function buildComparisonSheetHtml({ fontCss, items, baselineLogoMarkup, baselineIconMarkup }) {
  const cardsHtml = items
    .map((item) => {
      const monoBlock = item.monoSvg
        ? `<div class="sheet-mono-wrap" title="Single-ink stencil">${cleanInlineSvg(item.monoSvg)}</div>`
        : '';
      return `
      <article class="sheet-card">
        <div class="sheet-card__head">
          <div class="sheet-card__title-group">
            <span class="sheet-num">CONCEPT ${escapeHtml(item.number)}</span>
            <h2 class="sheet-title">${escapeHtml(item.name)}</h2>
          </div>
          <span class="sheet-tag">${escapeHtml(item.tagline)}</span>
        </div>
        <div class="sheet-lockup-stage">
          ${cleanInlineSvg(item.logoSvg)}
        </div>
        <div class="sheet-card__foot">
          <div class="sheet-icons-strip">
            <div class="sheet-icon-cell">
              <div class="sheet-icon-box sheet-icon-box--64">${cleanInlineSvg(item.iconSvg)}</div>
              <span class="sheet-cap">64px</span>
            </div>
            <div class="sheet-icon-cell">
              <div class="sheet-icon-box sheet-icon-box--32">${cleanInlineSvg(item.iconSvg)}</div>
              <span class="sheet-cap">32px</span>
            </div>
            <div class="sheet-icon-cell">
              <div class="sheet-icon-box sheet-icon-box--20">${cleanInlineSvg(item.iconSvg)}</div>
              <span class="sheet-cap">20px</span>
            </div>
          </div>
          ${monoBlock}
        </div>
      </article>`;
    })
    .join('\n');

  const baselineCardHtml = baselineLogoMarkup
    ? `
      <article class="sheet-card sheet-card--baseline">
        <div class="sheet-card__head">
          <div class="sheet-card__title-group">
            <span class="sheet-num sheet-num--cobalt">CURRENT BASELINE</span>
            <h2 class="sheet-title">Original Citrus-Crate Mark</h2>
          </div>
          <span class="sheet-tag">splitbox-logo.svg · REFERENCE</span>
        </div>
        <div class="sheet-lockup-stage">
          ${cleanInlineSvg(baselineLogoMarkup)}
        </div>
        <div class="sheet-card__foot">
          <div class="sheet-icons-strip">
            ${
              baselineIconMarkup
                ? `<div class="sheet-icon-cell">
                    <div class="sheet-icon-box sheet-icon-box--64">${cleanInlineSvg(baselineIconMarkup)}</div>
                    <span class="sheet-cap">64px</span>
                   </div>
                   <div class="sheet-icon-cell">
                    <div class="sheet-icon-box sheet-icon-box--32">${cleanInlineSvg(baselineIconMarkup)}</div>
                    <span class="sheet-cap">32px</span>
                   </div>`
                : ''
            }
          </div>
          <div class="sheet-baseline-note">
            UoB Drop #01 · Vale · Shackleton · 100% Offline GBP (£) Identity Suite · Zero Blur / Hard Crate Shadows
          </div>
        </div>
      </article>`
    : '';

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <style>
    ${fontCss}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1360px;
      height: 960px;
      overflow: hidden;
      background-color: #F7FAF8;
      background-image:
        linear-gradient(to right, rgba(11, 36, 28, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(11, 36, 28, 0.05) 1px, transparent 1px);
      background-size: 32px 32px;
      color: #0B241C;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .sheet-shell {
      width: 1360px;
      height: 960px;
      padding: 22px 26px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #FFFFFF;
      border: 2px solid #0B241C;
      border-radius: 14px;
      box-shadow: 3px 3px 0px #0B241C;
      padding: 12px 20px;
    }
    .sheet-header__left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .sheet-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1.5px solid #0B241C;
      background: #10D48E;
      color: #0B241C;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .sheet-h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 23px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #0B241C;
    }
    .sheet-h1 span { color: #1849D6; }
    .sheet-header__right {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
    }
    .sheet-swatch-bar {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px;
      background: #EDF7F2;
      border: 1.5px solid #0B241C;
      border-radius: 6px;
    }
    .sw {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      border: 1.5px solid #0B241C;
      display: inline-block;
    }
    .sheet-grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 16px;
      min-height: 0;
    }
    .sheet-card {
      background: #FFFFFF;
      border: 2px solid #0B241C;
      border-radius: 16px;
      box-shadow: 3px 3px 0px #0B241C;
      padding: 13px 15px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 9px;
      min-height: 0;
    }
    .sheet-card--baseline {
      background: #EEF2FF;
    }
    .sheet-card__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .sheet-card__title-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .sheet-num {
      display: inline-block;
      align-self: flex-start;
      padding: 2px 7px;
      border-radius: 5px;
      background: #FF6B1A;
      color: #0B241C;
      border: 1.5px solid #0B241C;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .sheet-num--cobalt {
      background: #1849D6;
      color: #FFFFFF;
    }
    .sheet-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0B241C;
      line-height: 1.15;
    }
    .sheet-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px;
      font-weight: 700;
      color: #4A665C;
      background: #F7FAF8;
      border: 1.5px solid #CBE0D6;
      border-radius: 5px;
      padding: 3px 6px;
      white-space: nowrap;
    }
    .sheet-lockup-stage {
      height: 132px;
      background: #F7FAF8;
      border: 1.5px solid #0B241C;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 4px;
    }
    .sheet-lockup-stage > svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    .sheet-card__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 6px;
      border-top: 1.5px dashed #CBE0D6;
    }
    .sheet-icons-strip {
      display: flex;
      align-items: flex-end;
      gap: 10px;
    }
    .sheet-icon-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .sheet-icon-box {
      border: 1.5px solid #0B241C;
      border-radius: 8px;
      background: #F7FAF8;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sheet-icon-box > svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    .sheet-icon-box--64 { width: 56px; height: 56px; border-radius: 12px; }
    .sheet-icon-box--32 { width: 32px; height: 32px; border-radius: 7px; }
    .sheet-icon-box--20 { width: 20px; height: 20px; border-radius: 4px; }
    .sheet-cap {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      font-weight: 700;
      color: #4A665C;
    }
    .sheet-mono-wrap {
      width: 186px;
      height: 62px;
      background: #F7FAF8;
      border: 1.5px dashed #0B241C;
      border-radius: 8px;
      overflow: hidden;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sheet-mono-wrap > svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    .sheet-baseline-note {
      flex: 1;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.4;
      color: #0B241C;
      background: #FFFFFF;
      border: 1.5px solid #0B241C;
      border-radius: 8px;
      padding: 7px 9px;
    }
  </style>
</head>
<body>
  <div class="sheet-shell">
    <header class="sheet-header">
      <div class="sheet-header__left">
        <span class="sheet-pill">★ BRAND IDENTITY STUDIO</span>
        <h1 class="sheet-h1">Split<span>Box</span> — 5 Tactile Campus Logo Concepts (2x HiDPI Audit Sheet)</h1>
      </div>
      <div class="sheet-header__right">
        <span>UOB VALE · SHACKLETON · GBP £</span>
        <span class="sheet-swatch-bar">
          <i class="sw" style="background:#0B241C"></i>
          <i class="sw" style="background:#10D48E"></i>
          <i class="sw" style="background:#FF6B1A"></i>
          <i class="sw" style="background:#1849D6"></i>
          <i class="sw" style="background:#F7FAF8"></i>
        </span>
      </div>
    </header>
    <main class="sheet-grid">
      ${cardsHtml}
      ${baselineCardHtml}
    </main>
  </div>
</body>
</html>`;
}

async function runWithConcurrency(tasks, concurrency = 4) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const allowPartial = args.includes('--available');
  const smokeIdx = args.indexOf('--smoke-test');
  const smokeOutDir = smokeIdx !== -1 ? args[smokeIdx + 1] : null;

  const chromeBin = findChromeBinary();
  const fontCss = buildEmbeddedFontFaceCss();

  if (smokeOutDir) {
    if (!fs.existsSync(BASELINE_LOGO_SVG) || !fs.existsSync(BASELINE_ICON_SVG)) {
      throw new Error('Baseline splitbox-logo.svg / splitbox-icon.svg not found for --smoke-test');
    }
    const outDir = path.resolve(smokeOutDir);
    const logoSvg = fs.readFileSync(BASELINE_LOGO_SVG, 'utf8');
    const iconSvg = fs.readFileSync(BASELINE_ICON_SVG, 'utf8');
    const logoPng = path.join(outDir, 'smoke-logo.png');
    const iconPng = path.join(outDir, 'smoke-icon.png');

    const logoMeta = await renderHtmlToPng({
      chromeBin,
      html: buildSingleSvgStageHtml({ fontCss, svgMarkup: logoSvg, cssWidth: 600, cssHeight: 200 }),
      outPath: logoPng,
      cssWidth: 600,
      cssHeight: 200,
      scaleFactor: 2,
    });
    const iconMeta = await renderHtmlToPng({
      chromeBin,
      html: buildSingleSvgStageHtml({ fontCss, svgMarkup: iconSvg, cssWidth: 200, cssHeight: 200 }),
      outPath: iconPng,
      cssWidth: 200,
      cssHeight: 200,
      scaleFactor: 2,
    });
    console.log(
      `[smoke-test] OK -> smoke-logo.png (${logoMeta.width}x${logoMeta.height}, ${logoMeta.bytes}B), smoke-icon.png (${iconMeta.width}x${iconMeta.height}, ${iconMeta.bytes}B)`
    );
    return;
  }

  const outDir = DEFAULT_OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const discovered = [];
  const missing = [];

  for (const concept of CONCEPTS) {
    const dir = path.join(LOGOS_ROOT, concept.slug);
    const logoPath = path.join(dir, 'logo.svg');
    const iconPath = path.join(dir, 'icon.svg');
    const monoPath = path.join(dir, 'mono.svg');
    const specPath = path.join(dir, 'spec.json');

    if (!fs.existsSync(logoPath) || !fs.existsSync(iconPath)) {
      missing.push(concept.slug);
      continue;
    }

    let name = concept.name;
    let tagline = concept.tagline;
    if (fs.existsSync(specPath)) {
      try {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        if (spec.name) name = spec.name;
        if (spec.tagline) tagline = spec.tagline;
      } catch {
        // Keep deterministic fallback metadata if spec.json is mid-write
      }
    }

    discovered.push({
      ...concept,
      name,
      tagline,
      logoSvg: fs.readFileSync(logoPath, 'utf8'),
      iconSvg: fs.readFileSync(iconPath, 'utf8'),
      monoSvg: fs.existsSync(monoPath) ? fs.readFileSync(monoPath, 'utf8') : null,
    });
  }

  if (missing.length > 0 && !allowPartial) {
    console.error(
      `[render-logos] Waiting on ${missing.length} concept suite(s): ${missing.join(', ')}`
    );
    process.exit(1);
  }

  if (discovered.length === 0) {
    console.log('[render-logos] No concept SVGs found yet.');
    return;
  }

  const renderTasks = [];
  for (const item of discovered) {
    const logoOut = path.join(outDir, `${item.slug}-logo.png`);
    const iconOut = path.join(outDir, `${item.slug}-icon.png`);

    renderTasks.push(async () => {
      const meta = await renderHtmlToPng({
        chromeBin,
        html: buildSingleSvgStageHtml({
          fontCss,
          svgMarkup: item.logoSvg,
          cssWidth: 600,
          cssHeight: 200,
          bgColor: 'transparent',
        }),
        outPath: logoOut,
        cssWidth: 600,
        cssHeight: 200,
        scaleFactor: 2,
      });
      return { file: path.relative(ROOT_DIR, logoOut), ...meta };
    });

    renderTasks.push(async () => {
      const meta = await renderHtmlToPng({
        chromeBin,
        html: buildSingleSvgStageHtml({
          fontCss,
          svgMarkup: item.iconSvg,
          cssWidth: 200,
          cssHeight: 200,
          bgColor: 'transparent',
        }),
        outPath: iconOut,
        cssWidth: 200,
        cssHeight: 200,
        scaleFactor: 2,
      });
      return { file: path.relative(ROOT_DIR, iconOut), ...meta };
    });
  }

  if (discovered.length === CONCEPTS.length) {
    const sheetOut = path.join(outDir, 'splitbox-5-logos-sheet.png');
    const baselineLogoMarkup = fs.existsSync(BASELINE_LOGO_SVG)
      ? fs.readFileSync(BASELINE_LOGO_SVG, 'utf8')
      : null;
    const baselineIconMarkup = fs.existsSync(BASELINE_ICON_SVG)
      ? fs.readFileSync(BASELINE_ICON_SVG, 'utf8')
      : null;

    renderTasks.push(async () => {
      const meta = await renderHtmlToPng({
        chromeBin,
        html: buildComparisonSheetHtml({
          fontCss,
          items: discovered,
          baselineLogoMarkup,
          baselineIconMarkup,
        }),
        outPath: sheetOut,
        cssWidth: 1360,
        cssHeight: 960,
        scaleFactor: 2,
      });
      return { file: path.relative(ROOT_DIR, sheetOut), ...meta };
    });
  }

  const summaries = await runWithConcurrency(renderTasks, 4);
  console.log(`[render-logos] Rendered ${summaries.length} HiDPI PNG file(s) using ${chromeBin}:`);
  for (const s of summaries) {
    console.log(`  - ${s.file} (${s.width}x${s.height}, ${(s.bytes / 1024).toFixed(1)} KB)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[render-logos] ERROR:', err.message || err);
    process.exit(1);
  });
}

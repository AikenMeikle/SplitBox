#!/usr/bin/env node
/**
 * SplitBox Brand Identity & SVG QA Verifier (`scripts/verify-logos.mjs`)
 *
 * Audits all 5 SplitBox logo concept suites under `public/assets/logos/`,
 * the offline showcase studio `public/logos/index.html`, and (when `--with-png`
 * is passed) the rasterized PNG outputs in `public/assets/logos/renderings/`.
 *
 * Usage:
 *   node scripts/verify-logos.mjs
 *   node scripts/verify-logos.mjs --with-png
 *   node scripts/verify-logos.mjs --with-png --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LOGOS_BASE_DIR = path.join(ROOT_DIR, 'public', 'assets', 'logos');
const STUDIO_HTML_PATH = path.join(ROOT_DIR, 'public', 'logos', 'index.html');
const RENDERINGS_DIR = path.join(LOGOS_BASE_DIR, 'renderings');

const CONCEPTS = [
  {
    number: 1,
    slug: '01-radial-citrus-meter',
    prefix: 'opt1-',
    owner: '@logo-meter',
  },
  {
    number: 2,
    slug: '02-isometric-split-crate',
    prefix: 'opt2-',
    owner: '@logo-crate',
  },
  {
    number: 3,
    slug: '03-perforated-drop-stamp',
    prefix: 'opt3-',
    owner: '@logo-ticket',
  },
  {
    number: 4,
    slug: '04-interlocking-s-monogram',
    prefix: 'opt4-',
    owner: '@logo-monogram',
  },
  {
    number: 5,
    slug: '05-campus-coop-crest',
    prefix: 'opt5-',
    owner: '@logo-crest',
  },
];

const SVG_SPECS = [
  { file: 'logo.svg', viewBox: '0 0 600 200', isMono: false },
  { file: 'icon.svg', viewBox: '0 0 200 200', isMono: false },
  { file: 'mono.svg', viewBox: '0 0 600 200', isMono: true },
];

const REQUIRED_SPEC_KEYS = [
  'id',
  'number',
  'name',
  'tagline',
  'conceptSummary',
  'brandTieIn',
  'bestUsedFor',
  'paletteUsed',
];

const APPROVED_COLOR_PALETTE = new Set([
  '#F7FAF8', // Canvas
  '#FFFFFF', // Surface
  '#EDF7F2', // Mint Tint
  '#EEF2FF', // Cobalt Tint
  '#0B241C', // Primary Ink
  '#4A665C', // Secondary Forest
  '#CBE0D6', // Subtle Border
  '#10D48E', // Botanical Mint
  '#087F53', // Deep Mint
  '#FF6B1A', // Zesty Tangerine
  '#E05206', // Deep Tangerine
  '#1849D6', // Electric Cobalt
]);

const APPROVED_MONO_PALETTE = new Set([
  '#0B241C',
  '#F7FAF8',
  '#FFFFFF',
]);

const NON_COLOR_PAINT_KEYWORDS = new Set([
  'none',
  'transparent',
  'inherit',
  'currentcolor',
]);

const DARK_INK_REQUIRED_FILLS = new Set(['#10D48E', '#FF6B1A']);

const ALLOWED_XML_NAMESPACES = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/2000/xmlns/',
]);

const FORBIDDEN_SVG_BLUR_PATTERNS = [
  { pattern: /<\s*feGaussianBlur\b/i, label: '<feGaussianBlur>' },
  { pattern: /<\s*feDropShadow\b/i, label: '<feDropShadow>' },
  { pattern: /drop-shadow\s*\(/i, label: 'CSS drop-shadow()' },
  { pattern: /<\s*radialGradient\b/i, label: '<radialGradient>' },
  { pattern: /<\s*linearGradient\b/i, label: '<linearGradient>' },
  { pattern: /radial-gradient\s*\(/i, label: 'CSS radial-gradient()' },
  { pattern: /linear-gradient\s*\(/i, label: 'CSS linear-gradient()' },
  { pattern: /\bblur\s*\(/i, label: 'CSS blur()' },
];

const FORBIDDEN_HTML_BLUR_PATTERNS = [
  { pattern: /<\s*feGaussianBlur\b/i, label: '<feGaussianBlur>' },
  { pattern: /<\s*feDropShadow\b/i, label: '<feDropShadow>' },
  { pattern: /drop-shadow\s*\(/i, label: 'CSS drop-shadow()' },
];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_PNG_BYTES = 1024;

function relPath(absPath) {
  return path.relative(ROOT_DIR, absPath).replace(/\\/g, '/');
}

function normalizeHex(raw) {
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

/**
 * Strips XML comments while verifying every `<!--` has a matching `-->`.
 */
function stripXmlComments(xml, addError) {
  let out = '';
  let idx = 0;
  while (idx < xml.length) {
    const start = xml.indexOf('<!--', idx);
    if (start === -1) {
      out += xml.slice(idx);
      break;
    }
    out += xml.slice(idx, start);
    const end = xml.indexOf('-->', start + 4);
    if (end === -1) {
      addError('Unclosed XML comment `<!--`');
      break;
    }
    const commentBody = xml.slice(start + 4, end);
    if (commentBody.includes('--')) {
      addError('Invalid `--` inside XML comment (breaks strict XML/SVG parsers)');
    }
    idx = end + 3;
  }
  return out;
}

/**
 * Checks for unescaped bare `&` outside CDATA sections in XML.
 */
function checkXmlEntities(xmlWithoutComments, addError) {
  const withoutCdata = xmlWithoutComments.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const bareAmpRegex = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  let match;
  while ((match = bareAmpRegex.exec(withoutCdata)) !== null) {
    const snippet = withoutCdata.slice(Math.max(0, match.index - 16), match.index + 24).replace(/\s+/g, ' ');
    addError(`Unescaped '&' entity in XML near "${snippet}" (use &amp;)`);
    break;
  }
}

/**
 * Parses attributes on an XML start tag, detecting duplicate attributes or malformed quotes.
 */
function parseXmlAttributes(attrSource, tagName, addError) {
  const attrs = new Map();
  let i = 0;
  const n = attrSource.length;

  while (i < n) {
    while (i < n && /\s/.test(attrSource[i])) i++;
    if (i >= n) break;

    const nameStart = i;
    while (i < n && !/[\s=/>"']/.test(attrSource[i])) i++;
    const attrName = attrSource.slice(nameStart, i);
    if (!attrName) {
      addError(`Malformed attribute syntax in <${tagName}> near "${attrSource.slice(i, i + 20)}"`);
      break;
    }

    while (i < n && /\s/.test(attrSource[i])) i++;
    if (attrSource[i] !== '=') {
      addError(`Attribute "${attrName}" on <${tagName}> is missing '="value"' (XML requires explicit attribute values)`);
      break;
    }
    i++; // skip '='
    while (i < n && /\s/.test(attrSource[i])) i++;

    const quote = attrSource[i];
    if (quote !== '"' && quote !== "'") {
      addError(`Attribute "${attrName}" on <${tagName}> must have a quoted value`);
      break;
    }
    i++; // skip opening quote
    const valStart = i;
    while (i < n && attrSource[i] !== quote) i++;
    if (i >= n) {
      addError(`Unclosed quote for attribute "${attrName}" on <${tagName}>`);
      break;
    }
    const attrVal = attrSource.slice(valStart, i);
    i++; // skip closing quote

    if (attrs.has(attrName)) {
      addError(`Duplicate XML attribute "${attrName}" on <${tagName}> (strict SVG parsers reject this)`);
    }
    attrs.set(attrName, attrVal);
  }

  return attrs;
}

/**
 * Lightweight strict XML AST parser for SVG files.
 */
function parseSvgXml(rawContent, addError) {
  const cleaned = stripXmlComments(rawContent, addError);
  checkXmlEntities(cleaned, addError);

  const rootChildren = [];
  const stack = [{ tag: '#document', attrs: new Map(), children: rootChildren, text: '' }];
  let i = 0;
  const n = cleaned.length;

  while (i < n) {
    const lt = cleaned.indexOf('<', i);
    if (lt === -1) {
      stack[stack.length - 1].text += cleaned.slice(i);
      break;
    }
    if (lt > i) {
      const txt = cleaned.slice(i, lt);
      stack[stack.length - 1].text += txt;
      stack[stack.length - 1].children.push({ type: 'text', value: txt });
    }

    // CDATA
    if (cleaned.startsWith('<![CDATA[', lt)) {
      const endCdata = cleaned.indexOf(']]>', lt + 9);
      if (endCdata === -1) {
        addError('Unclosed <![CDATA[ section');
        break;
      }
      const cdataText = cleaned.slice(lt + 9, endCdata);
      stack[stack.length - 1].text += cdataText;
      stack[stack.length - 1].children.push({ type: 'text', value: cdataText });
      i = endCdata + 3;
      continue;
    }

    // XML declaration or processing instruction `<?...?>`
    if (cleaned.startsWith('<?', lt)) {
      const endPi = cleaned.indexOf('?>', lt + 2);
      if (endPi === -1) {
        addError('Unclosed XML processing instruction `<?`');
        break;
      }
      i = endPi + 2;
      continue;
    }

    // DOCTYPE if any
    if (cleaned.startsWith('<!', lt)) {
      const endDecl = cleaned.indexOf('>', lt + 2);
      if (endDecl === -1) {
        addError('Unclosed XML declaration `<!`');
        break;
      }
      i = endDecl + 1;
      continue;
    }

    // Find closing '>' respecting attribute quotes
    let gt = lt + 1;
    let activeQuote = null;
    while (gt < n) {
      const ch = cleaned[gt];
      if (activeQuote) {
        if (ch === activeQuote) activeQuote = null;
      } else if (ch === '"' || ch === "'") {
        activeQuote = ch;
      } else if (ch === '>') {
        break;
      }
      gt++;
    }
    if (gt >= n) {
      addError(`Unclosed tag starting near "${cleaned.slice(lt, lt + 40).replace(/\s+/g, ' ')}"`);
      break;
    }

    const rawTag = cleaned.slice(lt + 1, gt).trim();
    if (!rawTag) {
      addError('Empty `<>` tag in XML');
      i = gt + 1;
      continue;
    }

    if (rawTag.startsWith('/')) {
      const closeName = rawTag.slice(1).trim();
      const top = stack[stack.length - 1];
      if (stack.length <= 1) {
        addError(`Unexpected closing tag </${closeName}> at root level`);
      } else if (top.tag !== closeName) {
        addError(`Mismatched closing tag </${closeName}> (expected </${top.tag}>)`);
      } else {
        stack.pop();
      }
      i = gt + 1;
      continue;
    }

    const selfClosing = rawTag.endsWith('/');
    const tagContent = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spaceMatch = tagContent.match(/^([^\s/>]+)([\s\S]*)$/);
    if (!spaceMatch) {
      addError(`Malformed tag <${rawTag.slice(0, 30)}>`);
      i = gt + 1;
      continue;
    }

    const tagName = spaceMatch[1];
    const attrPart = spaceMatch[2] || '';
    const attrs = parseXmlAttributes(attrPart, tagName, addError);
    const node = {
      type: 'element',
      tag: tagName,
      attrs,
      children: [],
      text: '',
      order: i,
    };

    stack[stack.length - 1].children.push(node);

    if (!selfClosing) {
      // Raw text handling inside <style> if author didn't wrap in CDATA and has no nested tags
      if (tagName === 'style') {
        const closeIdx = cleaned.indexOf('</style>', gt + 1);
        if (closeIdx === -1) {
          addError('Unclosed <style> tag');
          break;
        }
        const styleBody = cleaned.slice(gt + 1, closeIdx);
        const cdataUnwrapped = styleBody.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        node.text = cdataUnwrapped;
        node.children.push({ type: 'text', value: cdataUnwrapped });
        i = closeIdx + '</style>'.length;
        continue;
      }
      stack.push(node);
    }

    i = gt + 1;
  }

  if (stack.length > 1) {
    const unclosed = stack.slice(1).map((s) => `<${s.tag}>`).join(', ');
    addError(`Unclosed XML element(s): ${unclosed}`);
  }

  const elementRoots = rootChildren.filter((c) => c.type === 'element');
  if (elementRoots.length !== 1 || elementRoots[0].tag !== 'svg') {
    addError(
      `Expected exactly 1 root <svg> element, found ${
        elementRoots.length === 0 ? 'none' : elementRoots.map((e) => `<${e.tag}>`).join(', ')
      }`
    );
    return null;
  }

  return elementRoots[0];
}

/**
 * Checks external http(s) URLs (excluding allowed XML namespaces) & Google Fonts.
 */
function checkOfflineAndCurrency(rawText, filePath, addError, { isHtml = false } = {}) {
  const urlRegex = /https?:\/\/[^\s"'<>)\]`]+/gi;
  let match;
  while ((match = urlRegex.exec(rawText)) !== null) {
    const cleanedUrl = match[0].replace(/[.,;]+$/, '');
    if (!ALLOWED_XML_NAMESPACES.has(cleanedUrl)) {
      addError(`Forbidden external URL "${cleanedUrl}" in ${relPath(filePath)} (must be 100% offline)`);
    }
  }

  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(rawText)) {
    addError(`Forbidden Google Fonts reference found in ${relPath(filePath)}`);
  }

  if (/(?:src|href)\s*=\s*["']\/\//i.test(rawText) || /url\(\s*["']?\/\//i.test(rawText)) {
    addError(`Forbidden protocol-relative external URL "//..." found in ${relPath(filePath)}`);
  }

  if (!isHtml) {
    if (rawText.includes('$')) {
      const idx = rawText.indexOf('$');
      const snippet = rawText.slice(Math.max(0, idx - 15), idx + 20).replace(/\s+/g, ' ');
      addError(`Forbidden '$' character in ${relPath(filePath)} near "${snippet}" (use GBP '£' only)`);
    }
  } else {
    // For HTML: forbid any '$' outside <script>, and forbid USD '$' literals inside <script> (allowing JS `${...}` template interpolation)
    const outsideScripts = rawText.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    if (outsideScripts.includes('$')) {
      const idx = outsideScripts.indexOf('$');
      const snippet = outsideScripts.slice(Math.max(0, idx - 15), idx + 20).replace(/\s+/g, ' ');
      addError(`Forbidden '$' character in HTML/CSS of ${relPath(filePath)} near "${snippet}" (use GBP '£' only)`);
    }
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let sMatch;
    while ((sMatch = scriptRegex.exec(rawText)) !== null) {
      // Strip ES template interpolations `${...}` iteratively
      let scriptBody = sMatch[1];
      let prev = '';
      while (scriptBody !== prev) {
        prev = scriptBody;
        scriptBody = scriptBody.replace(/\$\{[^{}]*\}/g, '');
      }
      if (scriptBody.includes('$')) {
        const idx = scriptBody.indexOf('$');
        const snippet = scriptBody.slice(Math.max(0, idx - 15), idx + 20).replace(/\s+/g, ' ');
        addError(`Forbidden '$' character inside <script> of ${relPath(filePath)} near "${snippet}"`);
      }
    }
  }
}

/**
 * Extracts CSS rules from `<style>` blocks:
 * returns { classNames: string[], classStyles: Map<string, Record<string, string>>, allDeclarations: Array<{ selector: string, props: Record<string, string> }> }
 */
function parseCssStyleBlock(cssText) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const classNames = [];
  const classStyles = new Map();
  const allDeclarations = [];

  // Flatten @media wrappers one level so inner rules are inspected too
  const flattened = withoutComments.replace(/@media[^{]+\{([\s\S]*?)\}\s*\}/g, '$1}');
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRegex.exec(flattened)) !== null) {
    const selectorRaw = match[1].trim();
    const bodyRaw = match[2].trim();
    if (selectorRaw.startsWith('@')) continue;

    // Extract `.className` selectors in selector part
    const classSelRegex = /(?:^|[^0-9a-zA-Z_-])\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
    let cMatch;
    const matchedClassesInSelector = [];
    while ((cMatch = classSelRegex.exec(selectorRaw)) !== null) {
      classNames.push(cMatch[1]);
      matchedClassesInSelector.push(cMatch[1]);
    }

    const props = {};
    for (const decl of bodyRaw.split(';')) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = decl.slice(0, colonIdx).trim().toLowerCase();
      const val = decl.slice(colonIdx + 1).trim();
      if (prop && val) {
        props[prop] = val;
      }
    }

    allDeclarations.push({ selector: selectorRaw, props });

    // Record direct single-class style properties for SVG fill/font resolution
    for (const selPart of selectorRaw.split(',')) {
      const trimmedSel = selPart.trim();
      const singleClass = trimmedSel.match(/^\.([a-zA-Z_-][a-zA-Z0-9_-]*)$/);
      if (singleClass) {
        const cls = singleClass[1];
        const existing = classStyles.get(cls) || {};
        classStyles.set(cls, { ...existing, ...props });
      }
    }
  }

  return { classNames, classStyles, allDeclarations };
}

function parseInlineStyle(styleAttr) {
  const props = {};
  if (!styleAttr) return props;
  for (const decl of styleAttr.split(';')) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (prop && val) props[prop] = val;
  }
  return props;
}

/**
 * Validates a single paint value (`fill`, `stroke`, `stop-color`, `flood-color`, `color`)
 * against approved SplitBox brand tokens (or strict mono tokens).
 */
function validatePaintToken(rawVal, propName, contextLabel, isMono, addError) {
  if (!rawVal) return null;
  const cleaned = rawVal.replace(/!important/gi, '').trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (NON_COLOR_PAINT_KEYWORDS.has(lower)) {
    return lower;
  }
  if (/^url\(\s*#[^)]+\s*\)$/i.test(cleaned)) {
    return cleaned;
  }

  const hex = normalizeHex(cleaned);
  if (!hex) {
    addError(
      `Disapproved non-hex color ${propName}="${cleaned}" on ${contextLabel} — must use exact SplitBox hex tokens`
    );
    return null;
  }

  const allowedSet = isMono ? APPROVED_MONO_PALETTE : APPROVED_COLOR_PALETTE;
  if (!allowedSet.has(hex)) {
    const paletteDesc = isMono
      ? 'mono palette (#0B241C, #F7FAF8, #FFFFFF, none, transparent)'
      : `SplitBox brand tokens (${Array.from(APPROVED_COLOR_PALETTE).join(', ')})`;
    addError(`Off-palette color ${propName}="${cleaned}" (${hex}) on ${contextLabel} — allowed: ${paletteDesc}`);
  }
  return hex;
}

/**
 * 2D affine matrix helpers `[a, b, c, d, e, f]` for SVG coordinate geometry.
 */
function multiplyMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m, x, y) {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

function parseSvgTransform(transformStr) {
  let mat = [1, 0, 0, 1, 0, 0];
  if (!transformStr) return mat;
  const fnRegex = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = fnRegex.exec(transformStr)) !== null) {
    const fn = match[1].toLowerCase();
    const nums = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (nums.some((v) => Number.isNaN(v))) continue;

    let sub = [1, 0, 0, 1, 0, 0];
    if (fn === 'translate') {
      const tx = nums[0] ?? 0;
      const ty = nums[1] ?? 0;
      sub = [1, 0, 0, 1, tx, ty];
    } else if (fn === 'scale') {
      const sx = nums[0] ?? 1;
      const sy = nums[1] ?? sx;
      sub = [sx, 0, 0, sy, 0, 0];
    } else if (fn === 'rotate') {
      const rad = ((nums[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const cx = nums[1] ?? 0;
      const cy = nums[2] ?? 0;
      if (cx !== 0 || cy !== 0) {
        sub = multiplyMatrix(
          multiplyMatrix([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]),
          [1, 0, 0, 1, -cx, -cy]
        );
      } else {
        sub = [cos, sin, -sin, cos, 0, 0];
      }
    } else if (fn === 'matrix' && nums.length >= 6) {
      sub = nums.slice(0, 6);
    }
    mat = multiplyMatrix(mat, sub);
  }
  return mat;
}

/**
 * Computes approximate local bounding box `[minX, minY, maxX, maxY]` of an SVG shape.
 */
function computeLocalShapeBounds(node) {
  const num = (k, def = 0) => {
    const raw = node.attrs.get(k);
    if (raw === undefined) return def;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : def;
  };

  if (node.tag === 'rect') {
    const x = num('x', 0);
    const y = num('y', 0);
    const w = num('width', 0);
    const h = num('height', 0);
    if (w <= 0 || h <= 0) return null;
    return [x, y, x + w, y + h];
  }

  if (node.tag === 'circle') {
    const cx = num('cx', 0);
    const cy = num('cy', 0);
    const r = num('r', 0);
    if (r <= 0) return null;
    return [cx - r, cy - r, cx + r, cy + r];
  }

  if (node.tag === 'ellipse') {
    const cx = num('cx', 0);
    const cy = num('cy', 0);
    const rx = num('rx', 0);
    const ry = num('ry', 0);
    if (rx <= 0 || ry <= 0) return null;
    return [cx - rx, cy - ry, cx + rx, cy + ry];
  }

  if (node.tag === 'polygon' || node.tag === 'polyline') {
    const ptsRaw = node.attrs.get('points') || '';
    const coords = ptsRaw
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter((v) => Number.isFinite(v));
    if (coords.length < 4) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < coords.length; i += 2) {
      minX = Math.min(minX, coords[i]);
      maxX = Math.max(maxX, coords[i]);
      minY = Math.min(minY, coords[i + 1]);
      maxY = Math.max(maxY, coords[i + 1]);
    }
    return [minX, minY, maxX, maxY];
  }

  if (node.tag === 'path') {
    const d = node.attrs.get('d') || '';
    const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
    if (!tokens || tokens.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const record = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let cmd = '';
    let idx = 0;

    const nextNum = () => parseFloat(tokens[idx++]);
    const hasNum = () => idx < tokens.length && !/^[a-zA-Z]$/.test(tokens[idx]);

    while (idx < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[idx])) {
        cmd = tokens[idx++];
      }
      if (!cmd) break;

      const upper = cmd.toUpperCase();
      const isRel = cmd !== upper;

      if (upper === 'Z') {
        cx = sx;
        cy = sy;
        cmd = '';
        continue;
      }

      if (!hasNum()) break;

      if (upper === 'M') {
        let first = true;
        while (hasNum()) {
          const x = nextNum();
          const y = nextNum();
          cx = isRel ? cx + x : x;
          cy = isRel ? cy + y : y;
          if (first) {
            sx = cx;
            sy = cy;
            first = false;
          }
          record(cx, cy);
        }
      } else if (upper === 'L' || upper === 'T') {
        while (hasNum()) {
          const x = nextNum();
          const y = nextNum();
          cx = isRel ? cx + x : x;
          cy = isRel ? cy + y : y;
          record(cx, cy);
        }
      } else if (upper === 'H') {
        while (hasNum()) {
          const x = nextNum();
          cx = isRel ? cx + x : x;
          record(cx, cy);
        }
      } else if (upper === 'V') {
        while (hasNum()) {
          const y = nextNum();
          cy = isRel ? cy + y : y;
          record(cx, cy);
        }
      } else if (upper === 'C') {
        while (hasNum()) {
          const x1 = nextNum();
          const y1 = nextNum();
          const x2 = nextNum();
          const y2 = nextNum();
          const x = nextNum();
          const y = nextNum();
          record(isRel ? cx + x1 : x1, isRel ? cy + y1 : y1);
          record(isRel ? cx + x2 : x2, isRel ? cy + y2 : y2);
          cx = isRel ? cx + x : x;
          cy = isRel ? cy + y : y;
          record(cx, cy);
        }
      } else if (upper === 'S' || upper === 'Q') {
        while (hasNum()) {
          const x1 = nextNum();
          const y1 = nextNum();
          const x = nextNum();
          const y = nextNum();
          record(isRel ? cx + x1 : x1, isRel ? cy + y1 : y1);
          cx = isRel ? cx + x : x;
          cy = isRel ? cy + y : y;
          record(cx, cy);
        }
      } else if (upper === 'A') {
        while (hasNum()) {
          const rx = Math.abs(nextNum());
          const ry = Math.abs(nextNum());
          nextNum(); // x-axis-rotation
          nextNum(); // large-arc-flag
          nextNum(); // sweep-flag
          const x = nextNum();
          const y = nextNum();
          const endX = isRel ? cx + x : x;
          const endY = isRel ? cy + y : y;
          // Conservatively include arc midpoint bulge estimate along with endpoints
          const midX = (cx + endX) / 2;
          const midY = (cy + endY) / 2;
          record(cx, cy);
          record(endX, endY);
          record(midX - rx * 0.35, midY - ry * 0.35);
          record(midX + rx * 0.35, midY + ry * 0.35);
          cx = endX;
          cy = endY;
        }
      } else {
        idx++;
      }
    }

    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
    return [minX, minY, maxX, maxY];
  }

  return null;
}

function transformBounds(localBounds, mat) {
  const [x1, y1, x2, y2] = localBounds;
  const corners = [
    applyMatrix(mat, x1, y1),
    applyMatrix(mat, x2, y1),
    applyMatrix(mat, x2, y2),
    applyMatrix(mat, x1, y2),
  ];
  return [
    Math.min(...corners.map((p) => p.x)),
    Math.min(...corners.map((p) => p.y)),
    Math.max(...corners.map((p) => p.x)),
    Math.max(...corners.map((p) => p.y)),
  ];
}

/**
 * Full structural, namespace, offline, palette, and badge-contrast audit for one SVG file.
 */
function verifySvgFile({ absPath, expectedViewBox, expectedPrefix, isMono, globalIdsByConcept, conceptSlug }, addError) {
  if (!fs.existsSync(absPath)) {
    addError(`Missing required file: ${relPath(absPath)}`);
    return;
  }
  const stat = fs.statSync(absPath);
  if (stat.size === 0) {
    addError(`Empty file (0 bytes): ${relPath(absPath)}`);
    return;
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  if (!raw.trim()) {
    addError(`Whitespace-only file: ${relPath(absPath)}`);
    return;
  }

  // Rule 4: Offline & Currency
  checkOfflineAndCurrency(raw, absPath, addError, { isHtml: false });

  // Rule 5a: Zero blurs / gradients
  const rawWithoutComments = stripXmlComments(raw, () => {});
  for (const { pattern, label } of FORBIDDEN_SVG_BLUR_PATTERNS) {
    if (pattern.test(rawWithoutComments)) {
      addError(`Forbidden ${label} found in ${relPath(absPath)} (must use crisp zero-blur SplitBox craft)`);
    }
  }

  // Rule 2: Strict XML parse + root <svg xmlns="http://www.w3.org/2000/svg" viewBox="...">
  const svgRoot = parseSvgXml(raw, (msg) => addError(`${relPath(absPath)}: ${msg}`));
  if (!svgRoot) return;

  const xmlns = svgRoot.attrs.get('xmlns');
  if (xmlns !== 'http://www.w3.org/2000/svg') {
    addError(
      `${relPath(absPath)}: Root <svg> must declare xmlns="http://www.w3.org/2000/svg" (got ${JSON.stringify(xmlns)})`
    );
  }

  const actualViewBox = (svgRoot.attrs.get('viewBox') || '').trim().replace(/\s+/g, ' ');
  if (actualViewBox !== expectedViewBox) {
    addError(
      `${relPath(absPath)}: Expected viewBox="${expectedViewBox}", got viewBox=${JSON.stringify(
        svgRoot.attrs.get('viewBox')
      )}`
    );
  }

  // Collect CSS <style> rules, check class prefixes & CSS colors
  const classStyles = new Map();
  const localIds = new Set();
  const referencedIds = [];

  function collectStyles(node) {
    if (node.type !== 'element') return;
    if (node.tag === 'style') {
      const parsed = parseCssStyleBlock(node.text || '');
      for (const cls of parsed.classNames) {
        if (!cls.startsWith(expectedPrefix)) {
          addError(
            `${relPath(absPath)}: CSS class ".${cls}" inside <style> must start with "${expectedPrefix}" to prevent inline collisions`
          );
        }
        globalIdsByConcept.classes.push({ cls, conceptSlug, file: relPath(absPath) });
      }
      for (const [cls, props] of parsed.classStyles.entries()) {
        classStyles.set(cls, { ...(classStyles.get(cls) || {}), ...props });
      }
      for (const rule of parsed.allDeclarations) {
        for (const paintProp of ['fill', 'stroke', 'stop-color', 'flood-color', 'color']) {
          if (rule.props[paintProp]) {
            validatePaintToken(
              rule.props[paintProp],
              paintProp,
              `${relPath(absPath)} <style> "${rule.selector}"`,
              isMono,
              addError
            );
          }
        }
      }
    }
    for (const child of node.children) collectStyles(child);
  }
  collectStyles(svgRoot);

  // Walk all elements for IDs, class tokens, internal #id refs, paint tokens, and geometry
  const paintedShapes = [];
  const whiteTextProbes = [];

  function resolveEffectiveProp(node, propName, inheritedVal) {
    const inlineProps = parseInlineStyle(node.attrs.get('style'));
    if (inlineProps[propName]) return inlineProps[propName];
    if (node.attrs.has(propName)) return node.attrs.get(propName);
    const classAttr = node.attrs.get('class');
    if (classAttr) {
      for (const token of classAttr.trim().split(/\s+/).filter(Boolean)) {
        const cProps = classStyles.get(token);
        if (cProps && cProps[propName]) return cProps[propName];
      }
    }
    return inheritedVal;
  }

  function walk(node, state) {
    if (node.type !== 'element') return;

    const inHiddenContainer =
      state.inDefs ||
      node.tag === 'defs' ||
      node.tag === 'clipPath' ||
      node.tag === 'mask' ||
      node.tag === 'symbol' ||
      node.tag === 'pattern';

    // Rule 3: ID prefix & per-file uniqueness
    if (node.attrs.has('id')) {
      const idVal = node.attrs.get('id');
      if (!idVal.startsWith(expectedPrefix)) {
        addError(
          `${relPath(absPath)}: Element <${node.tag} id="${idVal}"> must use prefix "${expectedPrefix}"`
        );
      }
      if (localIds.has(idVal)) {
        addError(`${relPath(absPath)}: Duplicate id="${idVal}" within the same SVG file`);
      }
      localIds.add(idVal);
      globalIdsByConcept.ids.push({ id: idVal, conceptSlug, file: relPath(absPath) });
    }

    // Rule 3: class attribute tokens must also carry expectedPrefix
    if (node.attrs.has('class')) {
      const tokens = node.attrs.get('class').trim().split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        if (!tok.startsWith(expectedPrefix)) {
          addError(
            `${relPath(absPath)}: Element <${node.tag} class="${tok}"> must use prefix "${expectedPrefix}"`
          );
        }
      }
    }

    // Collect url(#...) and href="#..." references to ensure no dangling IDs
    for (const [attrName, attrVal] of node.attrs.entries()) {
      const urlRefRegex = /url\(\s*#([^)\s"']+)\s*\)/g;
      let uMatch;
      while ((uMatch = urlRefRegex.exec(attrVal)) !== null) {
        referencedIds.push({ ref: uMatch[1], context: `<${node.tag} ${attrName}="${attrVal}">` });
      }
      if ((attrName === 'href' || attrName === 'xlink:href') && attrVal.startsWith('#')) {
        referencedIds.push({ ref: attrVal.slice(1), context: `<${node.tag} ${attrName}="${attrVal}">` });
      }
    }

    // Validate paint attributes & inline styles on every element
    const inlineProps = parseInlineStyle(node.attrs.get('style'));
    for (const paintProp of ['fill', 'stroke', 'stop-color', 'flood-color', 'color']) {
      if (node.attrs.has(paintProp)) {
        validatePaintToken(
          node.attrs.get(paintProp),
          paintProp,
          `${relPath(absPath)} <${node.tag}>`,
          isMono,
          addError
        );
      }
      if (inlineProps[paintProp]) {
        validatePaintToken(
          inlineProps[paintProp],
          paintProp,
          `${relPath(absPath)} <${node.tag} style>`,
          isMono,
          addError
        );
      }
    }

    const nextMatrix = multiplyMatrix(state.matrix, parseSvgTransform(node.attrs.get('transform')));
    const rawFill = resolveEffectiveProp(node, 'fill', state.fill);
    const normalizedFill = rawFill ? normalizeHex(rawFill.replace(/!important/gi, '')) || rawFill.toLowerCase() : state.fill;
    const rawFontSize = resolveEffectiveProp(node, 'font-size', state.fontSize);
    const parsedFontSize = rawFontSize ? parseFloat(rawFontSize) : state.fontSize;
    const fontSize = Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : state.fontSize;
    const textAnchor = resolveEffectiveProp(node, 'text-anchor', state.textAnchor);

    // Record painted shapes in document painter's order (outside <defs>/<clipPath>/<mask>)
    if (!inHiddenContainer && ['rect', 'circle', 'ellipse', 'polygon', 'path'].includes(node.tag)) {
      if (normalizedFill && normalizedFill.startsWith('#')) {
        const localBounds = computeLocalShapeBounds(node);
        if (localBounds) {
          paintedShapes.push({
            tag: node.tag,
            fill: normalizedFill,
            bounds: transformBounds(localBounds, nextMatrix),
            order: node.order,
          });
        }
      }
    }

    // Check direct text on <text> or <tspan> for #FFFFFF contrast against #10D48E / #FF6B1A badges
    if (!isMono && !inHiddenContainer && (node.tag === 'text' || node.tag === 'tspan')) {
      const directText = node.children
        .filter((c) => c.type === 'text')
        .map((c) => c.value)
        .join('')
        .trim();

      const localX = node.attrs.has('x') ? parseFloat(node.attrs.get('x')) : state.textX;
      const localY = node.attrs.has('y') ? parseFloat(node.attrs.get('y')) : state.textY;
      const dx = node.attrs.has('dx') ? parseFloat(node.attrs.get('dx')) || 0 : 0;
      const dy = node.attrs.has('dy') ? parseFloat(node.attrs.get('dy')) || 0 : 0;

      const anchorX = (Number.isFinite(localX) ? localX : 0) + dx;
      const anchorY = (Number.isFinite(localY) ? localY : 0) + dy;

      if (directText.length > 0 && normalizedFill === '#FFFFFF') {
        const anchorShiftX =
          textAnchor === 'middle' ? 0 : textAnchor === 'end' ? -Math.min(8, fontSize * 0.4) : Math.min(8, fontSize * 0.4);
        const worldPt = applyMatrix(nextMatrix, anchorX + anchorShiftX, anchorY - fontSize * 0.32);
        whiteTextProbes.push({
          text: directText,
          x: worldPt.x,
          y: worldPt.y,
          order: node.order,
        });
      }

      const nextState = {
        inDefs: inHiddenContainer,
        matrix: nextMatrix,
        fill: normalizedFill,
        fontSize,
        textAnchor,
        textX: anchorX,
        textY: anchorY,
      };
      for (const child of node.children) walk(child, nextState);
      return;
    }

    const nextState = {
      inDefs: inHiddenContainer,
      matrix: nextMatrix,
      fill: normalizedFill,
      fontSize,
      textAnchor,
      textX: state.textX,
      textY: state.textY,
    };
    for (const child of node.children) walk(child, nextState);
  }

  walk(svgRoot, {
    inDefs: false,
    matrix: [1, 0, 0, 1, 0, 0],
    fill: '#0B241C',
    fontSize: 14,
    textAnchor: 'start',
    textX: 0,
    textY: 0,
  });

  // Check dangling url(#...) / href="#..." internal references
  for (const { ref, context } of referencedIds) {
    if (!localIds.has(ref)) {
      addError(`${relPath(absPath)}: Dangling reference to "#${ref}" in ${context} (no matching id="${ref}" found)`);
    }
  }

  // Catch any stray hex or functional colors across <style> blocks and non-text attributes
  const NON_COLOR_ATTRS = new Set([
    'id',
    'class',
    'href',
    'xlink:href',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'role',
    'd',
    'points',
    'viewBox',
    'transform',
    'xmlns',
    'xmlns:xlink',
  ]);

  function scanColorsInSource(src, label) {
    // Strip url(#...) before scanning for #hex
    const withoutUrlRefs = src.replace(/url\(\s*#[^)]*\)/gi, '');
    const hexScanRegex = /#[0-9a-fA-F]{3,8}\b/g;
    let hMatch;
    while ((hMatch = hexScanRegex.exec(withoutUrlRefs)) !== null) {
      const token = hMatch[0];
      const norm = normalizeHex(token);
      const allowedSet = isMono ? APPROVED_MONO_PALETTE : APPROVED_COLOR_PALETTE;
      if (!norm || !allowedSet.has(norm)) {
        addError(
          `${relPath(absPath)}: Unapproved hex literal "${token}" in ${label} — ${
            isMono ? 'mono.svg allows ONLY #0B241C, #F7FAF8, #FFFFFF' : 'must stick to approved SplitBox brand tokens'
          }`
        );
        break;
      }
    }

    const fnColorMatch = withoutUrlRefs.match(/\b(?:rgba?|hsla?)\s*\([^)]*\)/i);
    if (fnColorMatch) {
      addError(
        `${relPath(absPath)}: Disapproved functional color "${fnColorMatch[0]}" in ${label} — use exact SplitBox hex tokens`
      );
    }
  }

  function scanElementColors(node) {
    if (node.type !== 'element') return;
    if (node.tag === 'style') {
      const cssNoComments = (node.text || '').replace(/\/\*[\s\S]*?\*\//g, '');
      scanColorsInSource(cssNoComments, '<style>');
    }
    for (const [attrName, attrVal] of node.attrs.entries()) {
      if (NON_COLOR_ATTRS.has(attrName)) continue;
      scanColorsInSource(attrVal, `<${node.tag} ${attrName}>`);
    }
    for (const child of node.children) scanElementColors(child);
  }
  scanElementColors(svgRoot);

  // Rule 5c: Verify #FFFFFF text never sits directly on a #10D48E or #FF6B1A topmost painted shape
  for (const probe of whiteTextProbes) {
    let topmostShape = null;
    for (const shape of paintedShapes) {
      if (shape.order >= probe.order) break;
      const [bx1, by1, bx2, by2] = shape.bounds;
      if (probe.x >= bx1 && probe.x <= bx2 && probe.y >= by1 && probe.y <= by2) {
        topmostShape = shape;
      }
    }
    if (topmostShape && DARK_INK_REQUIRED_FILLS.has(topmostShape.fill)) {
      addError(
        `${relPath(absPath)}: Contrast violation — #FFFFFF text "${probe.text}" sits directly inside a ${topmostShape.fill} badge (<${topmostShape.tag}>); use #0B241C ink on #10D48E Mint & #FF6B1A Tangerine`
      );
    }
  }
}

/**
 * Verifies `spec.json` presence, JSON validity, required keys, and approved palette tokens.
 */
function verifySpecJson(concept, addError) {
  const specPath = path.join(LOGOS_BASE_DIR, concept.slug, 'spec.json');
  if (!fs.existsSync(specPath)) {
    addError(`Missing required file: ${relPath(specPath)}`);
    return;
  }
  const stat = fs.statSync(specPath);
  if (stat.size === 0) {
    addError(`Empty file (0 bytes): ${relPath(specPath)}`);
    return;
  }

  const raw = fs.readFileSync(specPath, 'utf8');
  checkOfflineAndCurrency(raw, specPath, addError, { isHtml: false });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    addError(`${relPath(specPath)}: Invalid JSON (${err.message})`);
    return;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    addError(`${relPath(specPath)}: Root JSON value must be an object`);
    return;
  }

  for (const key of REQUIRED_SPEC_KEYS) {
    if (!(key in parsed)) {
      addError(`${relPath(specPath)}: Missing required key "${key}"`);
    }
  }

  if (parsed.id !== concept.slug) {
    addError(`${relPath(specPath)}: Expected "id" === "${concept.slug}", got ${JSON.stringify(parsed.id)}`);
  }

  if (parsed.number !== concept.number) {
    addError(`${relPath(specPath)}: Expected "number" === ${concept.number}, got ${JSON.stringify(parsed.number)}`);
  }

  for (const strKey of ['name', 'tagline', 'conceptSummary', 'brandTieIn']) {
    if (typeof parsed[strKey] !== 'string' || parsed[strKey].trim().length === 0) {
      addError(`${relPath(specPath)}: Key "${strKey}" must be a non-empty string`);
    }
  }

  if (!Array.isArray(parsed.bestUsedFor) || parsed.bestUsedFor.length === 0 || parsed.bestUsedFor.some((x) => typeof x !== 'string' || !x.trim())) {
    addError(`${relPath(specPath)}: Key "bestUsedFor" must be a non-empty array of non-empty strings`);
  }

  if (!Array.isArray(parsed.paletteUsed) || parsed.paletteUsed.length === 0) {
    addError(`${relPath(specPath)}: Key "paletteUsed" must be a non-empty array of hex strings`);
  } else {
    for (const hexRaw of parsed.paletteUsed) {
      const norm = typeof hexRaw === 'string' ? normalizeHex(hexRaw) : null;
      if (!norm || !APPROVED_COLOR_PALETTE.has(norm)) {
        addError(
          `${relPath(specPath)}: Unapproved hex "${hexRaw}" in paletteUsed (allowed: ${Array.from(APPROVED_COLOR_PALETTE).join(', ')})`
        );
      }
    }
  }
}

/**
 * Verifies `public/logos/index.html` for offline compliance, SplitBox craft, and all 5 concept references.
 */
function verifyStudioHtml(addError) {
  if (!fs.existsSync(STUDIO_HTML_PATH)) {
    addError(`Missing required studio file: ${relPath(STUDIO_HTML_PATH)}`);
    return;
  }
  const stat = fs.statSync(STUDIO_HTML_PATH);
  if (stat.size === 0) {
    addError(`Empty file (0 bytes): ${relPath(STUDIO_HTML_PATH)}`);
    return;
  }

  const raw = fs.readFileSync(STUDIO_HTML_PATH, 'utf8');
  checkOfflineAndCurrency(raw, STUDIO_HTML_PATH, addError, { isHtml: true });

  for (const { pattern, label } of FORBIDDEN_HTML_BLUR_PATTERNS) {
    if (pattern.test(raw)) {
      addError(`${relPath(STUDIO_HTML_PATH)}: Forbidden ${label} detected`);
    }
  }

  for (const concept of CONCEPTS) {
    if (!raw.includes(concept.slug)) {
      addError(`${relPath(STUDIO_HTML_PATH)}: Missing reference to concept slug "${concept.slug}"`);
    }
  }

  for (const variant of ['logo.svg', 'icon.svg', 'mono.svg']) {
    if (!raw.includes(variant)) {
      addError(`${relPath(STUDIO_HTML_PATH)}: Missing reference to "${variant}" preview variant`);
    }
  }

  // Check CSS blocks & inline styles in index.html for #FFFFFF text on #10D48E / #FF6B1A backgrounds
  const isMintOrTangerineBg = (val) =>
    /#10d48e|#ff6b1a|--sb-mint-500|--sb-tangerine-500/i.test(val || '');
  const isWhiteText = (val) =>
    /#ffffff\b|#fff\b|\bwhite\b|--sb-bg-surface/i.test(val || '');

  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let sMatch;
  while ((sMatch = styleBlockRegex.exec(raw)) !== null) {
    const parsed = parseCssStyleBlock(sMatch[1]);
    for (const rule of parsed.allDeclarations) {
      const bg = rule.props['background-color'] || rule.props.background || '';
      const fg = rule.props.color || '';
      if (isMintOrTangerineBg(bg) && isWhiteText(fg)) {
        addError(
          `${relPath(STUDIO_HTML_PATH)}: Contrast violation in CSS "${rule.selector}" — white text (${fg}) on Mint/Tangerine background (${bg}); must use #0B241C ink`
        );
      }
    }
  }

  const inlineStyleRegex = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi;
  let iMatch;
  while ((iMatch = inlineStyleRegex.exec(raw)) !== null) {
    const props = parseInlineStyle(iMatch[2]);
    const bg = props['background-color'] || props.background || '';
    const fg = props.color || '';
    if (isMintOrTangerineBg(bg) && isWhiteText(fg)) {
      addError(
        `${relPath(STUDIO_HTML_PATH)}: Contrast violation in inline style="${iMatch[2]}" — white text on Mint/Tangerine background`
      );
    }
  }
}

/**
 * Verifies PNG magic bytes (`89 50 4E 47 0D 0A 1A 0A`), IHDR dimensions, and file sizes
 * inside `public/assets/logos/renderings/`.
 */
function verifyPngRenderings(addError) {
  if (!fs.existsSync(RENDERINGS_DIR)) {
    addError(`Missing PNG renderings directory: ${relPath(RENDERINGS_DIR)}`);
    return { checkedCount: 0, files: [] };
  }

  const requiredFiles = [];
  for (const concept of CONCEPTS) {
    requiredFiles.push({
      name: `${concept.slug}-logo.png`,
      minWidth: 600,
      minHeight: 200,
    });
    requiredFiles.push({
      name: `${concept.slug}-icon.png`,
      minWidth: 200,
      minHeight: 200,
    });
  }

  const existingEntries = fs
    .readdirSync(RENDERINGS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort();

  const requiredSet = new Set(requiredFiles.map((r) => r.name));
  for (const req of requiredFiles) {
    const abs = path.join(RENDERINGS_DIR, req.name);
    if (!fs.existsSync(abs)) {
      addError(`Missing required PNG render: ${relPath(abs)}`);
    }
  }

  const allToAudit = [
    ...requiredFiles,
    ...existingEntries
      .filter((f) => !requiredSet.has(f))
      .map((name) => ({ name, minWidth: 200, minHeight: 200 })),
  ];

  const inspected = [];
  for (const item of allToAudit) {
    const abs = path.join(RENDERINGS_DIR, item.name);
    if (!fs.existsSync(abs)) continue;

    const stat = fs.statSync(abs);
    if (stat.size < MIN_PNG_BYTES) {
      addError(
        `${relPath(abs)}: Trivial/corrupt PNG file size (${stat.size} bytes < ${MIN_PNG_BYTES} bytes minimum)`
      );
      continue;
    }

    const header = Buffer.alloc(24);
    const fd = fs.openSync(abs, 'r');
    try {
      const bytesRead = fs.readSync(fd, header, 0, 24, 0);
      if (bytesRead < 24) {
        addError(`${relPath(abs)}: File truncated (< 24 bytes)`);
        continue;
      }
    } finally {
      fs.closeSync(fd);
    }

    if (!header.subarray(0, 8).equals(PNG_MAGIC)) {
      const gotHex = Array.from(header.subarray(0, 4))
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      addError(`${relPath(abs)}: Invalid PNG magic bytes (expected 89 50 4E 47, got ${gotHex})`);
      continue;
    }

    const chunkType = header.subarray(12, 16).toString('ascii');
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (chunkType !== 'IHDR' || width < item.minWidth || height < item.minHeight) {
      addError(
        `${relPath(abs)}: Invalid PNG IHDR dimensions ${width}x${height} (expected >= ${item.minWidth}x${item.minHeight})`
      );
      continue;
    }

    inspected.push({
      file: relPath(abs),
      bytes: stat.size,
      width,
      height,
    });
  }

  return { checkedCount: inspected.length, files: inspected };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const withPng = args.has('--with-png') || args.has('--png');
  const jsonOutput = args.has('--json');

  const errorsByOwner = new Map();
  const recordError = (owner) => (msg) => {
    if (!errorsByOwner.has(owner)) errorsByOwner.set(owner, []);
    errorsByOwner.get(owner).push(msg);
  };

  const globalIdsByConcept = {
    ids: [],
    classes: [],
  };

  // 1-5: Audit all 5 logo concept suites
  for (const concept of CONCEPTS) {
    const addErr = recordError(concept.owner);
    const dir = path.join(LOGOS_BASE_DIR, concept.slug);
    if (!fs.existsSync(dir)) {
      addErr(`Missing concept folder: ${relPath(dir)}`);
      continue;
    }

    for (const svgSpec of SVG_SPECS) {
      verifySvgFile(
        {
          absPath: path.join(dir, svgSpec.file),
          expectedViewBox: svgSpec.viewBox,
          expectedPrefix: concept.prefix,
          isMono: svgSpec.isMono,
          globalIdsByConcept,
          conceptSlug: concept.slug,
        },
        addErr
      );
    }

    verifySpecJson(concept, addErr);
  }

  // Cross-concept collision check across opt1..opt5
  const seenIdToConcept = new Map();
  for (const entry of globalIdsByConcept.ids) {
    const prev = seenIdToConcept.get(entry.id);
    if (prev && prev.conceptSlug !== entry.conceptSlug) {
      recordError('@coordinator')(
        `Cross-concept SVG ID collision "${entry.id}" shared by ${prev.file} and ${entry.file}`
      );
    } else if (!prev) {
      seenIdToConcept.set(entry.id, entry);
    }
  }

  const seenClassToConcept = new Map();
  for (const entry of globalIdsByConcept.classes) {
    const prev = seenClassToConcept.get(entry.cls);
    if (prev && prev.conceptSlug !== entry.conceptSlug) {
      recordError('@coordinator')(
        `Cross-concept SVG CSS class collision ".${entry.cls}" shared by ${prev.file} and ${entry.file}`
      );
    } else if (!prev) {
      seenClassToConcept.set(entry.cls, entry);
    }
  }

  // Audit `public/logos/index.html`
  verifyStudioHtml(recordError('@logo-studio'));

  // Optional `--with-png` PNG raster audit
  let pngSummary = null;
  if (withPng) {
    pngSummary = verifyPngRenderings(recordError('@logo-studio'));
  }

  const totalErrors = Array.from(errorsByOwner.values()).reduce((sum, list) => sum + list.length, 0);

  if (jsonOutput) {
    const report = {
      ok: totalErrors === 0,
      withPng,
      totalErrors,
      errorsByOwner: Object.fromEntries(errorsByOwner.entries()),
      pngSummary,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(totalErrors === 0 ? 0 : 1);
  }

  console.log('=== SplitBox Brand Identity & SVG QA Verifier ===');
  console.log(`Checked 5 concept suites (15 SVGs + 5 spec.json) + public/logos/index.html${withPng ? ' + PNG renders' : ''}`);

  if (pngSummary && pngSummary.files.length > 0) {
    for (const f of pngSummary.files) {
      console.log(`  [PNG OK] ${f.file} (${f.width}x${f.height}, ${(f.bytes / 1024).toFixed(1)} KB)`);
    }
  }

  if (totalErrors === 0) {
    console.log('PASS: 0 brand, XML, namespace, offline, GBP currency, contrast, or PNG defects found.');
    process.exit(0);
  }

  console.error(`\nFAIL: ${totalErrors} defect(s) detected across ${errorsByOwner.size} owner(s):`);
  for (const [owner, errs] of errorsByOwner.entries()) {
    console.error(`\n  Owner ${owner} (${errs.length} issue${errs.length === 1 ? '' : 's'}):`);
    for (const e of errs) {
      console.error(`    - ${e}`);
    }
  }
  process.exit(1);
}

main();

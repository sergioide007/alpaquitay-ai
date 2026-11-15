#!/usr/bin/env node
'use strict';
/**
 * Builds the user manual (docs/manual/<lang>/*.md) into the static site served by GitHub Pages:
 * Spanish at /manual/, English at /manual/en/. Chapters with the same number prefix are translations of each other.
 *
 *   npm run manual:build           write manual/** (plus sitemap.xml and robots.txt at the site root)
 *   npm run manual:check           build in memory and fail if the committed output is stale
 *
 * The build fails on any broken internal link, missing anchor, missing image/video, unknown front-matter key or a
 * chapter that exists in one language but not the other. Media (screenshots, videos) live directly in manual/media/
 * and are never deleted by the build; everything else under manual/ is generated.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MarkdownIt = require('markdown-it');

const ROOT = path.resolve(__dirname, '..');
const ASSETS_SRC = path.join(ROOT, 'docs', 'manual', 'assets');
const DIAGRAMS_SRC = path.join(ROOT, 'docs', 'diagrams', 'svg');
const OUT = path.join(ROOT, 'manual');
const SITE = 'https://alpaquitay-ai.specsolid.com';
const REPO = 'https://github.com/sergioide007/alpaquitay-ai';
const CDN = 'https://alpaquitay.specsolid.com';
const CHECK = process.argv.includes('--check');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const LANGS = [
  { code: 'es', base: '', locale: 'es_ES', name: 'Español' },
  { code: 'en', base: 'en/', locale: 'en_US', name: 'English' },
];
const T = {
  es: {
    titleSuffix: 'Manual de Alpaquitay AI', skip: 'Saltar al contenido', openIndex: 'Abrir el índice', home: 'Alpaquitay AI, página principal',
    crumb: 'Manual', search: 'Buscar', searchAria: 'Buscar en el manual (Ctrl+K)', theme: 'Cambiar entre tema claro y oscuro', source: 'Código fuente en GitHub',
    install: 'Instalar', indexAria: 'Índice del manual', sideTitle: 'Manual de uso', changes: 'Cambios', chapter: 'Capítulo', onPage: 'En esta página',
    improve: 'Proponer una mejora a esta página', footer: 'Manual para Alpaquitay AI', prev: 'Anterior', next: 'Siguiente', chapters: 'Capítulos',
    searchDialog: 'Buscar en el manual', searchPlaceholder: 'Buscar: spec, diff, privacidad, WebGPU…', searchInput: 'Texto a buscar',
    searchHint: '<kbd>↑</kbd><kbd>↓</kbd> para moverte · <kbd>Enter</kbd> para abrir · <kbd>Esc</kbd> para cerrar', close: 'Cerrar', zoom: 'Ampliar',
    noVideo: 'Tu navegador no reproduce vídeo MP4.', downloadVideo: 'Descarga el vídeo', other: 'English', otherAria: 'Read this page in English',
    modelsLoading: 'Consultando los manifiestos firmados en', modelsNoscript: 'Activa JavaScript para ver el estado en vivo. La lista de modelos está en la tabla de abajo.',
    codeText: 'Texto',
    callouts: { NOTE: 'Nota', TIP: 'Consejo', IMPORTANT: 'Importante', WARNING: 'Atención', CAUTION: 'Cuidado' },
  },
  en: {
    titleSuffix: 'Alpaquitay AI manual', skip: 'Skip to content', openIndex: 'Open the table of contents', home: 'Alpaquitay AI home page',
    crumb: 'Manual', search: 'Search', searchAria: 'Search the manual (Ctrl+K)', theme: 'Switch between light and dark theme', source: 'Source code on GitHub',
    install: 'Install', indexAria: 'Manual contents', sideTitle: 'User manual', changes: 'Changelog', chapter: 'Chapter', onPage: 'On this page',
    improve: 'Suggest an improvement to this page', footer: 'Manual for Alpaquitay AI', prev: 'Previous', next: 'Next', chapters: 'Chapters',
    searchDialog: 'Search the manual', searchPlaceholder: 'Search: spec, diff, privacy, WebGPU…', searchInput: 'Search text',
    searchHint: '<kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close', close: 'Close', zoom: 'Enlarge',
    noVideo: 'Your browser cannot play MP4 video.', downloadVideo: 'Download the video', other: 'Español', otherAria: 'Leer esta página en español',
    modelsLoading: 'Fetching the signed manifests from', modelsNoscript: 'Turn on JavaScript to see the live status. The model list is in the table below.',
    codeText: 'Text',
    callouts: { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' },
  },
};

const errors = [];
const fail = (msg) => errors.push(msg);

// ── Data shared with the extension (single source of truth) ─────────────────────────────────────────
function readTrustedKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'local', 'trustedKeys.ts'), 'utf8');
  const body = src.slice(src.indexOf('PROJECT_PUBLIC_KEYS'));
  return [...body.matchAll(/'([A-Za-z0-9+/]{43}=)'/g)].map(m => m[1]);
}
function readDefaultModelId() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'local', 'cdnPolicy.ts'), 'utf8');
  const m = src.match(/DEFAULT_LOCAL_MODEL_ID\s*=\s*'([^']+)'/);
  if (!m) { throw new Error('DEFAULT_LOCAL_MODEL_ID not found in src/local/cdnPolicy.ts'); }
  return m[1];
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function slugify(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { fail(`${file}: missing front matter`); return { meta: {}, body: raw }; }
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (!kv) { if (line.trim()) { fail(`${file}: bad front-matter line "${line}"`); } continue; }
    if (!['title', 'nav', 'description', 'slug'].includes(kv[1])) { fail(`${file}: unknown front-matter key "${kv[1]}"`); }
    meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  for (const k of ['title', 'description']) { if (!meta[k]) { fail(`${file}: front matter needs "${k}"`); } }
  return { meta, body: raw.slice(m[0].length) };
}
function imageSize(file) {
  const buf = fs.readFileSync(file);
  if (file.endsWith('.png') && buf.toString('ascii', 12, 16) === 'IHDR') { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
  if (file.endsWith('.svg')) {
    const vb = buf.toString('utf8', 0, 2000).match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/);
    if (vb) { return { w: Math.round(+vb[1]), h: Math.round(+vb[2]) }; }
  }
  if (/\.jpe?g$/.test(file)) {
    for (let i = 2; i < buf.length - 9;) {
      if (buf[i] !== 0xff) { break; }
      const marker = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) { return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }; }
      i += 2 + len;
    }
  }
  return null;
}

// ── Markdown pipeline ───────────────────────────────────────────────────────────────────────────────
function createRenderer() {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

  // Heading ids + outline, callouts, figures. Runs once per document; env carries per-page state.
  md.core.ruler.push('alpaquitay', (state) => {
    const env = state.env; const used = new Set();
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      if (tok.type === 'heading_open') {
        const text = t[i + 1].children.filter(c => c.type === 'text' || c.type === 'code_inline').map(c => c.content).join('');
        let id = slugify(text); let n = 2;
        while (used.has(id)) { id = `${slugify(text)}-${n++}`; }
        used.add(id); tok.attrSet('id', id);
        env.anchors.add(id);
        if (tok.tag === 'h2' || tok.tag === 'h3') { env.outline.push({ level: tok.tag === 'h2' ? 2 : 3, id, text }); }
      }
      if (tok.type === 'blockquote_open' && t[i + 1] && t[i + 1].type === 'paragraph_open') {
        const inline = t[i + 2]; const first = inline.children[0];
        const m = first && first.type === 'text' && first.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
        if (m) {
          tok.meta = { callout: m[1] };
          first.content = first.content.slice(m[0].length);
          if (!first.content && inline.children[1] && inline.children[1].type === 'softbreak') { inline.children.splice(0, 2); }
          let depth = 0;
          for (let j = i; j < t.length; j++) {
            if (t[j].type === 'blockquote_open') { depth++; }
            if (t[j].type === 'blockquote_close' && --depth === 0) { t[j].meta = { callout: m[1] }; break; }
          }
        }
      }
      if (tok.type === 'paragraph_open' && t[i + 1] && t[i + 1].type === 'inline' && t[i + 2] && t[i + 2].type === 'paragraph_close') {
        const kids = t[i + 1].children;
        if (kids.length === 1 && kids[0].type === 'image') { tok.hidden = true; t[i + 2].hidden = true; kids[0].meta = { figure: true }; }
      }
    }
  });

  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const c = tokens[idx].meta && tokens[idx].meta.callout;
    return c ? `<aside class="callout callout-${c.toLowerCase()}"><p class="callout-title">${T[env.lang].callouts[c]}</p>\n` : self.renderToken(tokens, idx, opts);
  };
  md.renderer.rules.blockquote_close = (tokens, idx, opts, env, self) =>
    (tokens[idx].meta && tokens[idx].meta.callout ? '</aside>\n' : self.renderToken(tokens, idx, opts));
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';

  md.renderer.rules.image = (tokens, idx, opts, env) => {
    const tok = tokens[idx];
    const src = tok.attrGet('src'); const title = tok.attrGet('title');
    const alt = tok.children ? tok.children.map(c => c.content).join('') : tok.content;
    const resolved = env.asset(src);
    const size = resolved.file ? imageSize(resolved.file) : null;
    const dims = size ? ` width="${size.w}" height="${size.h}"` : '';
    const img = `<img src="${esc(resolved.url)}" alt="${esc(alt)}"${dims} loading="lazy" decoding="async">`;
    if (tok.meta && tok.meta.figure) {
      return `<figure class="figure"><a class="zoom" href="${esc(resolved.url)}" aria-label="${T[env.lang].zoom}: ${esc(alt)}">${img}</a>${title ? `<figcaption>${md.renderInline(title)}</figcaption>` : ''}</figure>\n`;
    }
    return img;
  };

  const defaultLink = md.renderer.rules.link_open || ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const tok = tokens[idx]; const href = tok.attrGet('href');
    if (/^(media|diagrams)\//.test(href)) { tok.attrSet('href', env.asset(href).url); }
    else if (/^https?:\/\//.test(href)) { tok.attrSet('rel', 'noopener'); }
    else if (!/^mailto:/.test(href)) { env.links.push(href); }
    return defaultLink(tokens, idx, opts, env, self);
  };

  md.renderer.rules.fence = (tokens, idx, opts, env) => {
    const tok = tokens[idx]; const lang = tok.info.trim().split(/\s+/)[0];
    if (lang === 'video') { return renderVideo(tok.content, env); }
    if (lang === 'models') { return renderModelsWidget(env); }
    const label = { bash: 'Bash', powershell: 'PowerShell', json: 'JSON', jsonc: 'JSON', markdown: 'Markdown', text: T[env.lang].codeText, diff: 'Diff', typescript: 'TypeScript', yaml: 'YAML' }[lang] || '';
    return `<div class="code"${label ? ` data-lang="${label}"` : ''}><pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(tok.content)}</code></pre></div>\n`;
  };
  return md;
}

function renderVideo(block, env) {
  const f = {};
  for (const line of block.split(/\r?\n/)) { const m = line.match(/^(src|poster|caption|duration|title):\s*(.+)$/); if (m) { f[m[1]] = m[2].trim(); } }
  if (!f.src || !f.poster || !f.caption || !f.title) { fail(`${env.file}: video block needs src, poster, title and caption`); return ''; }
  const src = env.asset(f.src); const poster = env.asset(f.poster);
  const size = poster.file ? imageSize(poster.file) : null;
  const dims = size ? ` width="${size.w}" height="${size.h}"` : '';
  const t = T[env.lang];
  return `<figure class="video">
<video controls preload="none" playsinline poster="${esc(poster.url)}"${dims} aria-label="${esc(f.title)}"><source src="${esc(src.url)}" type="video/mp4">${t.noVideo} <a href="${esc(src.url)}">${t.downloadVideo}</a>.</video>
<figcaption><strong>${esc(f.title)}</strong>${f.duration ? ` <span class="video-len">${esc(f.duration)}</span>` : ''} — ${env.md.renderInline(f.caption)}</figcaption>
</figure>\n`;
}

function renderModelsWidget(env) {
  const data = { cdn: CDN, keys: env.site.keys, defaultId: env.site.defaultId, models: env.site.models };
  const t = T[env.lang];
  return `<div class="models-live" data-models='${esc(JSON.stringify(data))}'>
<p class="models-status" role="status">${t.modelsLoading} <code>${esc(CDN)}</code>…</p>
<noscript><p>${t.modelsNoscript}</p></noscript>
</div>\n`;
}

// ── Page template ───────────────────────────────────────────────────────────────────────────────────
const pageUrl = (lang, page) => `${SITE}/manual/${lang.base}${page.slug ? `${page.slug}/` : ''}`;

function pageHtml(page, pages, counterpart, site) {
  const lang = page.langDef; const t = T[lang.code];
  const toLangRoot = page.slug ? '../' : '';                    // from this page to /manual/<base>
  const toManual = toLangRoot + (lang.base ? '../' : '');       // from this page to /manual/
  const idx = pages.indexOf(page);
  const prev = pages[idx - 1]; const next = pages[idx + 1];
  const url = pageUrl(lang, page);
  const href = (p) => `${toLangRoot}${p.slug ? `${p.slug}/` : ''}`;
  const nav = pages.map((p, i) => `<li><a href="${href(p)}"${p === page ? ' aria-current="page"' : ''}><span class="n">${String(i).padStart(2, '0')}</span>${esc(p.nav)}</a></li>`).join('\n');
  const toc = page.outline.filter(h => h.level === 2).length >= 2
    ? `<nav class="toc" aria-label="${t.onPage}"><p class="toc-title">${t.onPage}</p><ul>${page.outline.map(h => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>` : '';
  const other = LANGS.find(l => l !== lang);
  const otherHref = `${toManual}${other.base}${counterpart.slug ? `${counterpart.slug}/` : ''}`;
  const alternates = [page, counterpart].map(p => `<link rel="alternate" hreflang="${p.langDef.code}" href="${pageUrl(p.langDef, p)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${pageUrl(LANGS[1], lang.code === 'en' ? page : counterpart)}">`;
  const ld = { '@context': 'https://schema.org', '@type': 'TechArticle', headline: page.title, description: page.description, inLanguage: lang.code, url,
    isPartOf: { '@type': 'WebSite', name: 'Alpaquitay AI', url: `${SITE}/` }, about: { '@type': 'SoftwareApplication', name: 'Alpaquitay AI', applicationCategory: 'DeveloperApplication', operatingSystem: 'Windows, macOS, Linux (Visual Studio Code)' },
    author: { '@type': 'Person', name: 'Sergio Perez Ruiz', url: 'https://www.specsolid.com/' } };
  return `<!doctype html>
<html lang="${lang.code}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.slug ? `${page.title} · ${t.titleSuffix}` : page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}">
${alternates}
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:locale" content="${lang.locale}">
<meta name="theme-color" content="#07100d">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">
<link rel="stylesheet" href="${toManual}assets/manual.css?v=${site.assetHash}">
<script>try{var t=localStorage.getItem('alpaquitay-manual-theme');if(t){document.documentElement.setAttribute('data-theme',t);}else if(matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light');}}catch(e){}</script>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<a class="skip" href="#contenido">${t.skip}</a>
<header class="top">
  <button class="icon-btn menu" id="menuBtn" aria-label="${t.openIndex}" aria-controls="sidebar" aria-expanded="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg></button>
  <a class="brand" href="/" aria-label="${t.home}"><span class="brand-mark">▲</span><span>Alpaquitay AI</span></a>
  <a class="crumb" href="${toLangRoot || './'}">${t.crumb}</a>
  <button class="search-btn" id="searchBtn" aria-label="${t.searchAria}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3.5 3.5"/></svg><span>${t.search}</span><kbd>Ctrl K</kbd></button>
  <a class="lang" href="${otherHref}" hreflang="${other.code}" lang="${other.code}" aria-label="${t.otherAria}">${other.code.toUpperCase()}</a>
  <button class="icon-btn" id="themeBtn" aria-label="${t.theme}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7 5.5 5.5 0 0 1-7-7Z"/></svg></button>
  <a class="icon-btn" href="${REPO}" aria-label="${t.source}"><svg viewBox="0 0 16 16" aria-hidden="true" class="fill"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg></a>
  <a class="cta" href="https://marketplace.visualstudio.com/items?itemName=alpaquitay-ai.alpaquitay-ai">${t.install}</a>
</header>
<div class="layout">
<aside class="sidebar" id="sidebar" aria-label="${t.indexAria}">
  <p class="side-title">${t.sideTitle} <span class="ver">v${esc(PKG.version)}</span></p>
  <ol class="chapters">
${nav}
  </ol>
  <p class="side-foot"><a href="${REPO}/blob/main/README.md">README</a> · <a href="${REPO}/blob/main/CHANGELOG.md">${t.changes}</a> · <a href="${REPO}/issues">Issues</a></p>
</aside>
<main class="content" id="contenido">
<article class="doc">
${page.slug ? `<p class="kicker">${t.chapter} ${String(idx).padStart(2, '0')}</p>` : ''}
${page.html}
<div class="doc-foot">
  <a class="edit" href="${REPO}/edit/main/docs/manual/${lang.code}/${esc(page.file)}">${t.improve}</a>
  <span>${t.footer} ${esc(PKG.version)} · MIT</span>
</div>
<nav class="pager" aria-label="${t.chapters}">
${prev ? `<a class="prev" href="${href(prev)}"><span>${t.prev}</span>${esc(prev.nav)}</a>` : '<span></span>'}
${next ? `<a class="next" href="${href(next)}"><span>${t.next}</span>${esc(next.nav)}</a>` : '<span></span>'}
</nav>
</article>
${toc}
</main>
</div>
<div class="search" id="search" hidden>
  <div class="search-box" role="dialog" aria-modal="true" aria-label="${t.searchDialog}">
    <input id="searchInput" type="search" placeholder="${t.searchPlaceholder}" autocomplete="off" aria-label="${t.searchInput}">
    <ol id="searchResults" class="search-results"></ol>
    <p class="search-hint">${t.searchHint}</p>
  </div>
</div>
<div class="lightbox" id="lightbox" hidden><img alt=""><button class="icon-btn" aria-label="${t.close}">✕</button></div>
<script src="${toManual}assets/manual.js?v=${site.assetHash}" data-root="${toLangRoot || './'}" defer></script>
</body>
</html>
`;
}

// ── Build ───────────────────────────────────────────────────────────────────────────────────────────
function buildLanguage(lang, md, site) {
  const SRC = path.join(ROOT, 'docs', 'manual', lang.code);
  const sources = fs.readdirSync(SRC).filter(f => /^\d\d-.+\.md$/.test(f)).sort();
  const pages = sources.map((file) => {
    const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(SRC, file), 'utf8'), `${lang.code}/${file}`);
    const slug = meta.slug !== undefined ? meta.slug : file.replace(/^\d\d-/, '').replace(/\.md$/, '');
    return { file, num: file.slice(0, 2), slug, title: meta.title, nav: meta.nav || meta.title, description: meta.description, body, langDef: lang };
  });
  if (new Set(pages.map(p => p.slug)).size !== pages.length) { fail(`${lang.code}: duplicate page slugs`); }

  const depthToManual = (page) => (page.slug ? '../' : '') + (lang.base ? '../' : '');
  const search = [];
  for (const page of pages) {
    const env = {
      lang: lang.code, file: `${lang.code}/${page.file}`, md, site, anchors: new Set(), outline: [], links: [],
      asset(ref) {
        const clean = ref.split('#')[0];
        if (!/^(media|diagrams)\//.test(clean)) { fail(`${this.file}: asset "${ref}" must start with media/ or diagrams/`); return { url: ref, file: null }; }
        const onDisk = clean.startsWith('diagrams/') ? path.join(DIAGRAMS_SRC, clean.slice('diagrams/'.length)) : path.join(OUT, clean);
        if (!fs.existsSync(onDisk)) { fail(`${this.file}: missing asset ${clean}`); return { url: depthToManual(page) + ref, file: null }; }
        return { url: depthToManual(page) + ref, file: onDisk };
      },
    };
    const tokens = md.parse(page.body, env);
    page.html = md.renderer.render(tokens, md.options, env);
    page.outline = env.outline; page.anchors = env.anchors; page.links = env.links;
    if (!/^<h1[ >]/.test(page.html.trim())) { fail(`${env.file}: must start with a single "# " title`); }

    // Search: one entry per h2/h3 section, plain text only.
    let current = { h: page.title, id: '' }; let buf = [];
    const flush = () => { const x = buf.join(' ').replace(/\s+/g, ' ').trim(); if (x || current.id === '') { search.push({ p: page.nav, h: current.h, u: `${page.slug ? `${page.slug}/` : ''}${current.id ? `#${current.id}` : ''}`, x: x.slice(0, 1200) }); } buf = []; };
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === 'heading_open' && (tok.tag === 'h2' || tok.tag === 'h3')) { flush(); current = { h: tokens[i + 1].content, id: tok.attrGet('id') }; i++; continue; }
      if (tok.type === 'inline' && !(tokens[i - 1] && tokens[i - 1].type === 'heading_open' && tokens[i - 1].tag === 'h1')) { buf.push(tok.content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#|]/g, '')); }
    }
    flush();
  }
  return { lang, pages, search };
}

function build() {
  const files = new Map(); // relative output path → Buffer
  const put = (rel, data) => files.set(rel.replace(/\\/g, '/'), Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));

  for (const f of fs.readdirSync(ASSETS_SRC)) { put(`manual/assets/${f}`, fs.readFileSync(path.join(ASSETS_SRC, f))); }
  for (const f of fs.readdirSync(DIAGRAMS_SRC).filter(f => f.endsWith('.svg'))) { put(`manual/diagrams/${f}`, fs.readFileSync(path.join(DIAGRAMS_SRC, f))); }
  const assetHash = crypto.createHash('sha256').update(Buffer.concat([...files.entries()].filter(([k]) => k.startsWith('manual/assets/')).map(([, v]) => v))).digest('hex').slice(0, 10);

  const site = { keys: readTrustedKeys(), defaultId: readDefaultModelId(), models: ['qwen2.5-coder-1.5b-instruct', 'gemma-3-1b-it'], assetHash };
  if (!site.models.includes(site.defaultId)) { site.models.unshift(site.defaultId); }
  if (site.keys.length === 0) { fail('no trusted keys found in src/local/trustedKeys.ts'); }

  const md = createRenderer();
  const built = LANGS.map(lang => buildLanguage(lang, md, site));
  const [es, en] = built;
  const nums = (b) => b.pages.map(p => p.num).join(',');
  if (nums(es) !== nums(en)) { fail(`chapters differ between languages: es [${nums(es)}] en [${nums(en)}]`); }

  // Internal links must resolve to a page (and anchor, when given), in either language.
  const lookup = new Map();
  for (const b of built) { for (const p of b.pages) { lookup.set(`/manual/${b.lang.base}${p.slug ? `${p.slug}/` : ''}`, p); } }
  for (const b of built) {
    for (const page of b.pages) {
      for (const href of page.links) {
        const u = new URL(href, `https://x/manual/${b.lang.base}${page.slug ? `${page.slug}/` : ''}`);
        const target = lookup.get(u.pathname);
        if (!target) { fail(`${b.lang.code}/${page.file}: broken link "${href}" (link chapters as ../<slug>/)`); continue; }
        const anchor = decodeURIComponent(u.hash.slice(1));
        if (anchor && !target.anchors.has(anchor)) { fail(`${b.lang.code}/${page.file}: link "${href}" points to a missing anchor`); }
      }
    }
  }

  for (const b of built) {
    const other = built.find(x => x !== b);
    for (const page of b.pages) {
      const counterpart = other.pages.find(p => p.num === page.num) || other.pages[0];
      put(`manual/${b.lang.base}${page.slug ? `${page.slug}/` : ''}index.html`, pageHtml(page, b.pages, counterpart, site));
    }
    put(`manual/${b.lang.base}search-index.json`, JSON.stringify(b.search));
  }

  const lastmod = '2026-11-15';
  const urls = [`${SITE}/`, ...built.flatMap(b => b.pages.map(p => pageUrl(b.lang, p)))];
  put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  put('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  return { files, pages: built.flatMap(b => b.pages) };
}

function generatedOnDisk() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) { return; }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (rel === 'manual/media' || rel.startsWith('manual/media/')) { continue; }
      if (e.isDirectory()) { walk(full); } else { out.push(rel); }
    }
  };
  walk(OUT);
  return out;
}

const { files, pages } = build();
if (errors.length) {
  console.error(`manual: ${errors.length} error(s)\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
const stale = generatedOnDisk().filter(rel => !files.has(rel));
if (CHECK) {
  const diff = [...files].filter(([rel, buf]) => !fs.existsSync(path.join(ROOT, rel)) || !fs.readFileSync(path.join(ROOT, rel)).equals(buf)).map(([rel]) => rel);
  if (diff.length || stale.length) {
    console.error(`manual: output is out of date, run "npm run manual:build"\n  changed: ${diff.join(', ') || '-'}\n  stale: ${stale.join(', ') || '-'}`);
    process.exit(1);
  }
  console.log(`manual: up to date (${pages.length} pages, ${files.size} files)`);
} else {
  for (const rel of stale) { fs.rmSync(path.join(ROOT, rel)); }
  for (const [rel, buf] of files) {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!fs.existsSync(full) || !fs.readFileSync(full).equals(buf)) { fs.writeFileSync(full, buf); }
  }
  console.log(`manual: ${pages.length} pages, ${files.size} files written to manual/ (+ sitemap.xml, robots.txt)`);
}

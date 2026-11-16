// Sestaví web ze skutečných zdrojů repa (specifikace, overlay, šablona, písma,
// Scalar) a kontroluje, co se dostane do výstupu. Kde jde o to, jak jsou texty
// napsané (pojmy ze slovníku, osnova obou jazyků), čte přímo složku content/.
// Chování v prohlížeči (síť, úložiště) tím ověřené není; to se po změně
// nastavení nebo verze Scalaru ověřuje v prohlížeči.

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { build, siteInputs } from '../scripts/build.mjs';
import { composite, contrastRatio, MIN_CONTRAST } from '../scripts/contrast.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = 'assets/fonts';
/** Motiv je pokus a jde odebrat smazáním souboru; testy motivu pak nemají co kontrolovat. */
const HAS_THEME = existsSync(join(repoRoot, 'site/theme.css'));
let outDir;
/** Varování z buildu. */
const warnings = [];

before(async () => {
  outDir = join(await mkdtemp(join(tmpdir(), 'site-')), 'dist');
  await build({ ...(await siteInputs(repoRoot)), outDir, log: { info: () => {}, warn: (message) => warnings.push(message) } });
});

const read = (path) => readFile(join(outDir, path), 'utf8');

test('výstup obsahuje právě vyjmenované soubory', async () => {
  const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(outDir.length + 1))
    .sort();

  assert.deepEqual(files, [
    'assets/favicon.svg',
    'assets/fonts/LICENSE-inter.txt',
    'assets/fonts/LICENSE-jetbrains-mono.txt',
    'assets/fonts/fonts.css',
    'assets/fonts/inter-latin-ext-wght-italic.woff2',
    'assets/fonts/inter-latin-ext-wght-normal.woff2',
    'assets/fonts/inter-latin-wght-italic.woff2',
    'assets/fonts/inter-latin-wght-normal.woff2',
    'assets/fonts/inter-symbols.woff2',
    'assets/fonts/jetbrains-mono-latin-ext-wght-normal.woff2',
    'assets/fonts/jetbrains-mono-latin-wght-normal.woff2',
    'assets/scalar/standalone.js',
    'assets/site.css',
    ...(HAS_THEME ? ['assets/theme.css'] : []),
    'en/index.html',
    'en/openapi.prod.json',
    'en/openapi.test.json',
    'index.html',
    'openapi.prod.json',
    'openapi.test.json',
  ]);
});

/** Pravidla @font-face ze stylu písem: rodina, soubor a rozsahy znaků. */
async function fontFaces() {
  const css = await read(`${FONT_DIR}/fonts.css`);
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
    family: /font-family:\s*'([^']+)'/.exec(body)[1],
    file: /url\(([^)]+)\)/.exec(body)[1],
    ranges: /unicode-range:\s*([^;]+);/.exec(body)[1].split(',').map((range) => {
      const [from, to = from] = range.trim().slice(2).split('-');
      return [parseInt(from, 16), parseInt(to, 16)];
    }),
  }));
}

test('písma Inter a JetBrains Mono jsou přibalená jako WOFF2 a styl odkazuje jen na přibalené soubory', async () => {
  const faces = await fontFaces();

  assert.deepEqual([...new Set(faces.map((face) => face.family))].sort(), ['Inter', 'JetBrains Mono']);
  for (const { file } of faces) {
    const bytes = await readFile(join(outDir, FONT_DIR, file));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file} není WOFF2`);
  }
});

test('obě písma pokrývají českou diakritiku', async () => {
  const faces = await fontFaces();

  for (const family of ['Inter', 'JetBrains Mono']) {
    const ranges = faces.filter((face) => face.family === family).flatMap((face) => face.ranges);
    for (const letter of 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ') {
      const code = letter.codePointAt(0);
      assert.ok(ranges.some(([from, to]) => from <= code && code <= to), `${family} nepokrývá „${letter}“`);
    }
  }
});

test('stránky ani styly neodkazují na žádnou adresu s doménou', async () => {
  // Stránky a styl písem odkazují na soubory vždy; když v nich odkaz nenajde, je chyba v kontrole.
  const files = [
    ['index.html', true],
    ['en/index.html', true],
    [`${FONT_DIR}/fonts.css`, true],
    ['assets/site.css', false],
    ...(HAS_THEME ? [['assets/theme.css', false]] : []),
  ];
  for (const [path, hasReferences] of files) {
    const content = await read(path);
    // Odkaz, skript, styl ani písmo nesmí mít adresu se schématem nebo začínat lomítkem.
    const references = [...content.matchAll(/(?:href|src)="([^"]*)"|url\(([^)]*)\)/g)].map((match) => match[1] ?? match[2]);
    if (hasReferences) assert.ok(references.length > 0, `${path}: žádné odkazy ke kontrole`);
    for (const reference of references) {
      assert.doesNotMatch(reference, /^(?:[a-z][a-z0-9+.-]*:|\/)/i, `${path}: ${reference} není relativní cesta`);
    }
    assert.doesNotMatch(content, /https?:\/\//, `${path} obsahuje adresu s doménou`);
  }
});

test('společné soubory, na které stránky odkazují, ve výstupu existují', async () => {
  for (const [page, dir] of [['index.html', ''], ['en/index.html', 'en']]) {
    const content = await read(page);
    const references = [...content.matchAll(/(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
    for (const reference of references) {
      // Odkaz na složku vede na její index.html.
      const file = reference.endsWith('/') ? `${reference}index.html` : reference;
      await assert.doesNotReject(readFile(join(outDir, dir, file)), `${page}: ${reference} ve výstupu chybí`);
    }
  }
});

test('stránka předává Scalaru prostředí z environments.json, PROD jako výchozí', async () => {
  const content = await read('index.html');
  const sources = JSON.parse(/sources: (\[.*\]),/.exec(content)[1]);

  assert.deepEqual(sources.map(({ slug, default: isDefault }) => [slug, isDefault]), [['prod', true], ['test', false]]);
});

test('stránky mají ikonu z přibalených souborů', async () => {
  assert.match(await read('index.html'), /<link rel="icon" type="image\/svg\+xml" href="assets\/favicon\.svg">/);
  assert.match(await read('en/index.html'), /<link rel="icon" type="image\/svg\+xml" href="\.\.\/assets\/favicon\.svg">/);
});

test('Inter pokrývá symboly kláves, které Scalar ukazuje u klávesových zkratek', async () => {
  const ranges = (await fontFaces()).filter((face) => face.family === 'Inter').flatMap((face) => face.ranges);

  for (const symbol of '←↑→↓↵⇧⇪⌘⌥⌃') {
    const code = symbol.codePointAt(0);
    assert.ok(ranges.some(([from, to]) => from <= code && code <= to), `Inter nepokrývá „${symbol}“`);
  }
});

// Vzhled: záhlaví s logem a motiv.

test('nad referencí je záhlaví s logem, které vede na úvod a je vložené jako SVG', async () => {
  for (const page of ['index.html', 'en/index.html']) {
    const content = await read(page);
    const header = /<header class="site-header" data-scalar-scroll-header>(.*?)<\/header>/s.exec(content);
    assert.ok(header, `${page}: chybí záhlaví, které Scalar započítá do odsazení kotev`);
    assert.ok(content.indexOf(header[0]) < content.indexOf('<div id="app">'), `${page}: záhlaví není nad referencí`);
    const link = /<a class="site-logo" href="\.\/"[^>]*>(.*?)<\/a>/s.exec(header[1]);
    assert.ok(link, `${page}: logo neodkazuje na začátek stránky`);
    const full = /<span class="site-logo-full">(.*?)<\/span><span class="site-logo-symbol">(.*?)<\/span>$/s.exec(link[1]);
    assert.ok(full, `${page}: v odkazu loga není celé logo a jeho značka pro mobil`);
    const [, logo, symbol] = full;
    assert.match(logo, /^<svg[^>]*viewBox/, `${page}: logo není inline SVG`);
    assert.match(logo, /fill:currentColor/, `${page}: text loga nepřebírá barvu stránky`);
    assert.match(logo, /fill:#e0004d/i, `${page}: značka loga není ve firemní růžové`);
    assert.match(symbol, /^<svg[^>]*viewBox/, `${page}: značka loga pro mobil není inline SVG`);
    assert.deepEqual([...new Set([...symbol.matchAll(/fill:(#?\w+)/g)].map(([, color]) => color.toLowerCase()))], ['#e0004d'], `${page}: značka loga pro mobil není celá ve firemní růžové`);
  }
});

/** Deklarace `color` pravidla se selektorem `selector` ze stylu. */
const colorOf = (css, selector) => new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*?\\bcolor:\\s*([^;]+);`).exec(css)?.[1].trim();

test('text loga má ve světlém režimu barvu #53565A a v tmavém #FFFFFF', async () => {
  const css = await read('assets/site.css');

  assert.equal(colorOf(css, '.light-mode .site-logo')?.toLowerCase(), '#53565a');
  assert.equal(colorOf(css, '.dark-mode .site-logo')?.toLowerCase(), '#ffffff');
});

test('Scalar nemá vlastní motiv, vzhled určuje jen soubor s motivem', async () => {
  for (const page of ['index.html', 'en/index.html']) {
    const content = await read(page);
    assert.match(content, /theme: 'none',/, page);
    assert.equal(content.includes('href="assets/theme.css"') || content.includes('href="../assets/theme.css"'), HAS_THEME, page);
  }
});

/**
 * Proměnné motivu pro režim (`light-mode` nebo `dark-mode`): deklarace
 * z pravidel, jejichž selektor je jen třída režimu, s dosazenými var().
 */
async function themeVariables(mode) {
  const css = (await read('assets/theme.css')).replace(/\/\*.*?\*\//gs, '');
  const variables = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!selectors.split(',').map((selector) => selector.trim()).includes(`.${mode}`)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) variables[name] = value.trim();
  }
  const resolve = (value) => value.replace(/var\((--[\w-]+)\)/g, (_, name) => resolve(variables[name] ?? assert.fail(`${mode}: chybí ${name}`)));
  return Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, resolve(value)]));
}

/** Barva v zápisu #rrggbb nebo #rrggbbaa jako [r, g, b, průhlednost]. */
const parseHex = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, `${hex} není barva v zápisu #rrggbb(aa)`);
  const [r, g, b, alpha = 255] = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16));
  return [r, g, b, alpha / 255];
};

test('odkazy a aktivní položky menu mají akcent odvozený z firemní růžové', { skip: !HAS_THEME && 'motiv není' }, async () => {
  for (const [mode, accent] of [['light-mode', '#b3003e'], ['dark-mode', '#ff669c']]) {
    const variables = await themeVariables(mode);
    // Navštívený odkaz má jinak barvu textu (--scalar-color-2); prohlížeč ji
    // skriptům neprozradí, kontrola v prohlížeči by ji neodhalila.
    for (const name of ['--scalar-link-color', '--scalar-link-color-visited', '--scalar-sidebar-color-active', '--scalar-color-accent']) assert.equal(variables[name], accent, `${mode}: ${name}`);
  }
});

test('text v barvě akcentu má kontrast aspoň 4,5:1 na pozadích, kde se vyskytuje', { skip: !HAS_THEME && 'motiv není' }, async () => {
  for (const mode of ['light-mode', 'dark-mode']) {
    const variables = await themeVariables(mode);
    const color = (name) => parseHex(variables[name]);
    const page = color('--scalar-background-1');
    const sidebar = color('--scalar-sidebar-background-1');
    const pairs = [
      ['odkaz na stránce', '--scalar-link-color', page],
      ['odkaz na šedé ploše, třeba kód v odkazu', '--scalar-link-color', color('--scalar-background-2')],
      ['akcent na akcentovém podkladu', '--scalar-color-accent', composite(color('--scalar-background-accent'), page)],
      ['položka menu v barvě akcentu', '--scalar-sidebar-color-active', sidebar],
      ['aktivní položka menu', '--scalar-sidebar-color-active', composite(color('--scalar-sidebar-item-active-background'), sidebar)],
      ['položka menu pod myší', '--scalar-sidebar-color-active', color('--scalar-sidebar-item-hover-background')],
      ['text tlačítka', '--scalar-button-1-color', color('--scalar-button-1')],
      ['text tlačítka pod myší', '--scalar-button-1-color', color('--scalar-button-1-hover')],
    ];
    for (const [where, foreground, background] of pairs) {
      const ratio = contrastRatio(color(foreground), background);
      assert.ok(ratio >= MIN_CONTRAST, `${mode}, ${where}: kontrast ${ratio.toFixed(2)}:1`);
    }
  }
});

// Modrá metody GET v Latte (4,34:1 na stránce), oranžová (štítek required,
// PUT) a žlutá (varování, PATCH) mají kontrast pod 4,5:1; zvolil je zadavatel.
test('zelená metody POST má kontrast aspoň 4,5:1 na stránce i v menu', { skip: !HAS_THEME && 'motiv není' }, async () => {
  for (const mode of ['light-mode', 'dark-mode']) {
    const variables = await themeVariables(mode);
    const color = (name) => parseHex(variables[name]);
    const sidebar = color('--scalar-sidebar-background-1');
    const backgrounds = [
      ['stránka', color('--scalar-background-1')],
      ['menu', sidebar],
      ['aktivní položka menu', composite(color('--scalar-sidebar-item-active-background'), sidebar)],
      ['položka menu pod myší', color('--scalar-sidebar-item-hover-background')],
    ];
    for (const [where, background] of backgrounds) {
      const ratio = contrastRatio(color('--scalar-color-green'), background);
      assert.ok(ratio >= MIN_CONTRAST, `${mode}, ${where}: kontrast ${ratio.toFixed(2)}:1`);
    }
  }
});

test('barvy syntaxe v ukázkách kódu mají kontrast aspoň 4,5:1 na stránce i na podkladu ukázek', { skip: !HAS_THEME && 'motiv není' }, async () => {
  for (const mode of ['light-mode', 'dark-mode']) {
    const variables = await themeVariables(mode);
    const syntax = Object.keys(variables).filter((name) => name.startsWith('--code-'));
    assert.ok(syntax.length > 0, `${mode}: motiv nemá barvy syntaxe --code-*`);
    for (const background of ['--scalar-background-1', '--scalar-background-2']) {
      for (const name of syntax) {
        const ratio = contrastRatio(parseHex(variables[name]), parseHex(variables[background]));
        assert.ok(ratio >= MIN_CONTRAST, `${mode}, ${name} na ${background}: kontrast ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

// Specifikace po overlay: skutečné doplňky nad skutečnými zdrojovými specifikacemi.

const ENVIRONMENTS = JSON.parse(await readFile(join(repoRoot, 'environments.json'), 'utf8'));

/** Specifikace všech prostředí v obou jazykových verzích: `[popis, specifikace, prostředí]`. */
const builtSpecs = async () =>
  Promise.all(
    ENVIRONMENTS.flatMap((environment) =>
      ['', 'en/'].map(async (dir) => [`${dir}openapi.${environment.slug}.json`, JSON.parse(await read(`${dir}openapi.${environment.slug}.json`)), environment]),
    ),
  );

/** Jazyk verze, ze které je specifikace `file` (`en/openapi.prod.json` je anglická). */
const languageOf = (file) => (file.startsWith('en/') ? 'en' : 'cs');

/** Nadpisy kapitol úvodu v pořadí podle zadání (ZADANI část 1 a 7). */
const CHAPTERS = {
  cs: { intro: 'Úvod', authentication: 'Autentizace', guide: 'Průvodce synchronizací katalogu', xml: 'XML struktura', errors: 'Chyby', faq: 'Časté otázky' },
  en: { intro: 'Introduction', authentication: 'Authentication', guide: 'Catalog synchronization guide', xml: 'XML structure', errors: 'Errors', faq: 'Frequently asked questions' },
};
/** Nadpis kapitoly úvodu (`guide`, `faq`, …) v jazyce verze, ze které je specifikace `file`. */
const chapterTitle = (file, chapter) => CHAPTERS[languageOf(file)][chapter];

test('stažení katalogového souboru je v menu ve skupině Products', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const download = spec.paths['/files/{fileName}']?.get;
    assert.ok(download, `${file}: chybí GET /files/{fileName}`);
    assert.deepEqual(download.tags, ['Products'], file);
    assert.deepEqual(download.parameters.map(({ name, in: location, required }) => [name, location, required]), [['fileName', 'path', true]], file);
    assert.ok(download.responses[200].content['application/zip'], `${file}: odpověď 200 není ZIP`);
  }
});

test('skupiny jsou v pořadí Info, Codelist, Products, OrdersB2C, OrdersB2B a mají zobrazované názvy v jazyce verze', async () => {
  const names = {
    cs: ['Stav služby', 'Číselníky', 'Katalog produktů', 'Objednávky B2C', 'Objednávky B2B'],
    en: ['Service status', 'Codelists', 'Product catalog', 'B2C orders', 'B2B orders'],
  };
  for (const [file, spec] of await builtSpecs()) {
    const expected = names[languageOf(file)];
    assert.deepEqual(
      spec.tags.map((tag) => [tag.name, tag['x-displayName']]),
      ['Info', 'Codelist', 'Products', 'OrdersB2C', 'OrdersB2B'].map((name, index) => [name, expected[index]]),
      file,
    );
  }
});

test('odpověď GET /products/catalog je pole stavů jobu', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const content = Object.entries(spec.paths['/products/catalog'].get.responses[200].content);
    assert.ok(content.length > 0, file);
    for (const [mediaType, { schema }] of content) {
      assert.deepEqual(schema, { type: 'array', items: { $ref: '#/components/schemas/ProductCatalogModel' } }, `${file}: ${mediaType}`);
    }
  }
});

test('názvy operací jsou opravené a GET /Info má schválený název', async () => {
  const expected = {
    '/Info': 'Vrátí stav a verzi služby',
    '/codelists/ProductIndex': 'Číselník produktových indexů',
    '/codelists/ProductBindingsType': 'Číselník typů příslušenství/náhrad',
  };
  for (const [file, spec] of (await builtSpecs()).filter(([file]) => languageOf(file) === 'cs')) {
    for (const [path, summary] of Object.entries(expected)) assert.equal(spec.paths[path].get.summary, summary, `${file}: GET ${path}`);
    assert.equal(spec.paths['/products/catalog'].post.summary, 'Generování dropship katalogu produktů asynchronně', file);
  }
});

test('popisy adresy u číselníku mají správnou diakritiku', async () => {
  for (const [file, spec] of (await builtSpecs()).filter(([file]) => languageOf(file) === 'cs')) {
    const { city, zipCode } = spec.components.schemas.AddressExternalModel.properties;
    assert.deepEqual([city.description, zipCode.description], ['Město.', 'PSČ.'], file);
  }
});

test('popis zabezpečení odkazuje na token endpoint prostředí a nemá pokyn pro Swagger UI', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    const { description } = spec.components.securitySchemes.oauth2;
    assert.doesNotMatch(description, /textbox|Vlož/i, file);
    assert.ok(description.includes(environment.tokenUrl), `${file}: popis nezmiňuje ${environment.tokenUrl}`);
  }
});

test('specifikace prostředí má server s adresou jeho API', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    assert.deepEqual(spec.servers.map(({ url }) => url), [environment.baseUrl], file);
  }
});

test('názvy schémat nemají interní předpony a odkazy vedou na zkrácené názvy', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const names = Object.keys(spec.components.schemas);
    assert.deepEqual(names.filter((name) => name.includes('.')), [], file);
    assert.ok(names.includes('ProductUnitModel') && names.includes('CodelistProductUnitModel'), `${file}: chybí jednotky`);
    const refs = [...JSON.stringify(spec).matchAll(/"\$ref":"([^"]+)"/g)].map(([, target]) => target);
    assert.ok(refs.length > 0, file);
    for (const target of refs) assert.ok(names.includes(target.replace('#/components/schemas/', '')), `${file}: ${target}`);
  }
});

test('výsledná specifikace každého prostředí projde validací OpenAPI 3.0', async () => {
  const validator = new Validator();
  for (const [file, spec] of await builtSpecs()) {
    assert.match(spec.openapi, /^3\.0\./, file);
    const { valid, errors } = await validator.validate(spec);
    assert.ok(valid, `${file}: ${JSON.stringify(errors)}`);
  }
});

// Texty: skutečný obsah složky content/ vložený do specifikací.

/** Všechny řetězce specifikace. */
const stringsOf = (value) =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(stringsOf) : [];

test('úvod začíná nadpisem a prostředí s upozorněním ho má hned pod ním v jazyce verze', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    const lines = spec.info.description.split('\n');
    assert.match(lines[0], /^# \S/, `${file}: úvod nezačíná nadpisem`);
    const notice = environment.notice?.[languageOf(file)];
    if (notice) assert.deepEqual(lines.slice(1, 5), ['', '> [!WARNING]', `> ${notice}`, ''], file);
    else assert.ok(!spec.info.description.includes('[!WARNING]'), `${file}: upozornění u prostředí, které žádné nemá`);
  }
});

test('ve výsledné specifikaci nezůstal zástupný symbol, odkaz na soubor s textem ani konec řádku z Windows', async () => {
  for (const [file, spec] of await builtSpecs()) {
    for (const text of stringsOf(spec)) {
      assert.doesNotMatch(text, /\{\{\w+\}\}/, `${file}: zástupný symbol`);
      assert.doesNotMatch(text, /\]\([^)\s]*\.md[)#\s]/, `${file}: odkaz na soubor s textem`);
      assert.doesNotMatch(text, /\r/, `${file}: konec řádku z Windows`);
    }
  }
});

/** Oddíly popisu operace v pořadí podle šablony (ZADANI část 14). */
const TEMPLATE_SECTIONS = {
  cs: ['Kdy ji volat', 'Na co si dát pozor', 'Příklad', 'Časté chyby'],
  en: ['When to call it', 'What to watch out for', 'Example', 'Common errors'],
};

test('šablona popisu operace existuje v obou jazycích, má jednotnou osnovu a na web se nedostane', async () => {
  for (const [language, sections] of Object.entries(TEMPLATE_SECTIONS)) {
    const template = await readFile(join(repoRoot, 'content', language, '_sablona-operace.md'), 'utf8');
    // Popis operace je text pod čarou; první odstavec říká, k čemu operace slouží.
    const body = template.slice(template.indexOf('\n---\n') + '\n---\n'.length);
    assert.match(body, /^\n\S/, `${language}: popis nezačíná odstavcem o účelu operace`);
    assert.deepEqual([...body.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading), sections, language);
  }
  for (const [file, spec] of await builtSpecs()) {
    assert.ok(!stringsOf(spec).some((text) => text.includes('Jak šablonu použít') || text.includes('How to use the template')), file);
  }
});

test('každá skupina má úvodní text', async () => {
  for (const [file, spec] of await builtSpecs()) {
    for (const tag of spec.tags) assert.match(tag.description ?? '', /\S/, `${file}: skupina ${tag.name} nemá text`);
  }
});

// Úvod, autentizace a chyby (ZADANI část 7).

/** Kapitoly úvodu podle nadpisů první úrovně; ukázky kódu se za nadpisy nepočítají. */
function introChapters(description) {
  const chapters = [];
  let fenced = false;
  for (const line of description.split('\n')) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^# (.+)$/.exec(line);
    if (heading) chapters.push({ title: heading[1], body: '' });
    else if (chapters.length > 0) chapters.at(-1).body += `${line}\n`;
  }
  return chapters;
}

/** Kapitola úvodu s daným nadpisem; když v úvodu není, test selže. */
function introChapter(file, spec, title) {
  const chapter = introChapters(spec.info.description).find((candidate) => candidate.title === title);
  assert.ok(chapter, `${file}: úvod nemá kapitolu ${title}`);
  return chapter;
}

/**
 * Operace synchronizace katalogu: skupina, metoda, cesta a soubor s popisem.
 * Úvod je vyjmenovává v přehledu a jejich popisy jsou vzorem pro další.
 */
const CATALOG_OPERATIONS = [
  { group: 'products', method: 'post', path: '/products/catalog', file: 'post__products_catalog.md' },
  { group: 'products', method: 'get', path: '/products/catalog', file: 'get__products_catalog.md' },
  { group: 'products', method: 'get', path: '/files/{fileName}', file: 'get__files_{fileName}.md' },
  { group: 'codelist', method: 'get', path: '/codelists/countries', file: 'get__codelists_countries.md' },
  { group: 'codelist', method: 'get', path: '/codelists/currencies', file: 'get__codelists_currencies.md' },
];

test('přehled operací v úvodu odkazuje na všech pět operací synchronizace katalogu', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    const [intro] = introChapters(spec.info.description);
    for (const { group, method, path } of CATALOG_OPERATIONS) {
      const operation = `${group}/${method.toUpperCase()}${path}`;
      assert.ok(intro.body.includes(`](#${environment.slug}/tag/${operation})`), `${file}: úvod neodkazuje na ${operation}`);
    }
  }
});

test('kapitola o autentizaci ukazuje token endpoint prostředí, postup v eD SHOPu a přihlašovací údaje jen jako zástupné hodnoty', async () => {
  const placeholders = { client_id: '{clientId}', client_secret: '{clientSecret}', username: '{username}', password: '{password}', refresh_token: '{refreshToken}' };
  for (const [file, spec, environment] of await builtSpecs()) {
    const chapter = introChapter(file, spec, chapterTitle(file, 'authentication'));
    assert.ok(chapter.body.includes(`'${environment.tokenUrl}'`), `${file}: ukázka nevolá ${environment.tokenUrl}`);
    assert.ok(chapter.body.includes('https://edshopb2b.edsystem.cz'), `${file}: chybí adresa eD SHOPu`);
    // Portál se píše „eD SHOP“; adresy v odkazech se nepočítají.
    for (const [name] of chapter.body.matchAll(/(?<![/.\w])ed ?shop(?![\w.])/gi)) assert.equal(name, 'eD SHOP', file);
    const sent = [...stringsOf(spec).join('\n').matchAll(/\b(client_id|client_secret|username|password|refresh_token)=([^\s'"&]*)/g)];
    assert.ok(sent.length >= Object.keys(placeholders).length, `${file}: chybí ukázky požadavku na token`);
    for (const [, parameter, value] of sent) assert.equal(value, placeholders[parameter], `${file}: ${parameter}`);
  }
});

test('úvod má kapitoly Úvod, Autentizace, Průvodce synchronizací katalogu, XML struktura, Chyby a Časté otázky v tomto pořadí', async () => {
  for (const [file, spec] of await builtSpecs()) {
    assert.deepEqual(introChapters(spec.info.description).map(({ title }) => title), Object.values(CHAPTERS[languageOf(file)]), file);
  }
});

test('úvod a text skupiny Products odkazují na průvodce synchronizací katalogu', async () => {
  const guideAddress = { cs: 'průvodce-synchronizací-katalogu', en: 'catalog-synchronization-guide' };
  for (const [file, spec, environment] of await builtSpecs()) {
    const link = `](#${environment.slug}/description/${guideAddress[languageOf(file)]})`;
    const [intro] = introChapters(spec.info.description);
    assert.ok(intro.body.includes(link), `${file}: úvod neodkazuje na průvodce`);
    assert.ok(spec.tags.find(({ name }) => name === 'Products').description.includes(link), `${file}: text skupiny Products neodkazuje na průvodce`);
  }
});

// Průvodce synchronizací katalogu, XML struktura a časté otázky (ZADANI část 7).

/** Ohrazený blok kódu; skupina 2 je jeho obsah. */
const FENCED_BLOCK = /^(```|~~~)[^\n]*\n(.*?)^\1[ \t]*$/gms;
/** Obsahy ohrazených bloků kódu v textu. */
const codeBlocks = (markdown) => [...markdown.matchAll(FENCED_BLOCK)].map(([, , code]) => code);

/** Texty ve složce content/<subdir> včetně šablony: `[cesta pod content/, obsah]`. */
async function contentFiles(subdir) {
  const dir = join(repoRoot, 'content', subdir);
  const paths = (await readdir(dir, { recursive: true })).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(paths.map(async (path) => [join(subdir, path), await readFile(join(dir, path), 'utf8')]));
}

test('průvodce určuje koncové stavy jobu podle zadání a pseudokód jim odpovídá', async () => {
  // Úspěch: Generated, nebo Successful s vyplněným fileName. Neúspěch: Error, Rejected,
  // Cancelled, Deleted. Ostatní stavy znamenají, že job běží (ZADANI část 7, Rozpory).
  for (const [file, spec] of await builtSpecs()) {
    const guide = introChapter(file, spec, chapterTitle(file, 'guide')).body;
    const rows = guide.split('\n').filter((line) => line.startsWith('|'));
    const success = rows.find((row) => row.includes('`Generated`'));
    assert.match(success ?? '', /`Successful` [^`|]+ `fileName`/, `${file}: tabulka konce jobu neuvádí úspěch Generated a Successful s fileName`);
    const failure = rows.find((row) => row.includes('`Error`'));
    assert.deepEqual(failure?.match(/`[A-Z]\w+`/g), ['`Error`', '`Rejected`', '`Cancelled`', '`Deleted`'], `${file}: tabulka konce jobu neuvádí neúspěch`);

    const pseudocode = codeBlocks(guide).find((code) => code.includes('runCatalog'));
    assert.ok(pseudocode, `${file}: průvodce nemá pseudokód`);
    assert.match(pseudocode, /isSuccess\(status\):\s+return status\.state == "Generated"\s+or \(status\.state == "Successful" and status\.fileName is not empty\)/, file);
    assert.match(pseudocode, /isFailure\(status\):\s+return status\.state in \["Error", "Rejected", "Cancelled", "Deleted"\]/, file);
    assert.match(pseudocode, /if isSuccess\(status\):[^]*?return success[^]*?if isFailure\(status\):[^]*?return failure\s+sleep\(/, `${file}: pseudokód se v ostatních stavech neptá dál`);
  }
});

/**
 * Zakázané výrazy ze slovníku, které mají v textech jiný, povolený význam:
 * „požadavek“ je v textech HTTP požadavek (slovník ho zakazuje jen jako název
 * jobu) a „endpoint“ slovník ve veřejných textech povoluje.
 */
const ALLOWED_TERMS = new Set(['požadavek', 'endpoint (v repu)']);
/** Ustálená spojení se zakázaným slovem: název smlouvy a oddíl v rozhraní eD SHOPu. */
const ALLOWED_PHRASES = [/dealersk\p{L}* smlouv\p{L}*/gu, /sekci „Moje nastavení“/gu];

test('české texty nepoužívají výrazy, které slovník zakazuje', async () => {
  const glossary = await readFile(join(repoRoot, 'GLOSSARY.md'), 'utf8');
  const forbidden = [...glossary.matchAll(/^_Nepoužívat_: (.+)$/gm)]
    .flatMap(([, list]) => list.split(',').map((term) => term.trim()))
    .filter((term) => !ALLOWED_TERMS.has(term));
  assert.ok(forbidden.length > 10, 'ze slovníku se nenačetly zakázané výrazy');
  // Výraz se hledá i ve skloňovaných tvarech: slovo bez koncové samohlásky a cokoli za ním.
  // Výraz s velkým písmenem (eDshop) se hledá s rozlišením velikosti, aby nenašel adresy.
  const stem = (word) => word.replace(/[aáeéěiíoóuůúyý]+$/iu, '');
  const patterns = forbidden.map((term) => [
    term,
    new RegExp(`(?<!\\p{L})${term.split(/\s+/).map(stem).join('\\p{L}*\\s+')}\\p{L}*`, term === term.toLowerCase() ? 'giu' : 'gu'),
  ]);
  for (const [path, markdown] of await contentFiles('cs')) {
    const text = ALLOWED_PHRASES.reduce((rest, phrase) => rest.replace(phrase, ''), markdown);
    for (const [term, pattern] of patterns) {
      assert.deepEqual(text.match(pattern) ?? [], [], `content/${path}: slovník místo „${term}“ předepisuje jiný pojem`);
    }
  }
});

test('checklist a ostatní seznamy jsou běžné seznamy, bez políček úkolů a zbytků převodu z dokumentu v1.4', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const checklist = introChapter(file, spec, chapterTitle(file, 'guide')).body.split(/^## /m).at(-1);
    assert.ok(checklist.split('\n').filter((line) => line.startsWith('- ')).length >= 20, `${file}: průvodce nekončí checklistem`);
    for (const text of stringsOf(spec)) {
      assert.doesNotMatch(text, /^\s*[-*+] \[[ xX]\]/m, `${file}: políčko úkolu`);
      assert.doesNotMatch(text, /^:::|<div class="page"|<!-- \/?TOC -->/m, `${file}: zbytek převodu z dokumentu v1.4`);
    }
  }
});

test('texty píšou adresu API a token endpointu jen zástupným symbolem prostředí', async () => {
  const hosts = ENVIRONMENTS.flatMap(({ baseUrl, tokenUrl }) => [new URL(baseUrl).host, new URL(tokenUrl).host]);
  for (const [path, markdown] of await contentFiles('')) {
    for (const host of hosts) assert.ok(!markdown.includes(host), `content/${path}: adresa ${host} místo {{baseUrl}} nebo {{tokenUrl}}`);
  }
});

test('časté otázky výklad neopakují: každá odpověď je krátká a odkazuje tam, kde je výklad', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    const faq = introChapter(file, spec, chapterTitle(file, 'faq')).body;
    const answers = faq.split(/^## /m).slice(1);
    assert.ok(answers.length >= 15, `${file}: časté otázky mají jen ${answers.length} otázek`);
    for (const answer of answers) {
      const [question, ...body] = answer.trim().split('\n');
      const text = body.join('\n');
      assert.match(text, new RegExp(`\\]\\(#${environment.slug}/(description|tag)/`), `${file}: odpověď na „${question}“ nikam neodkazuje`);
      assert.doesNotMatch(text, /^(```|\||\s*[-*+] |\s*\d+\. )/m, `${file}: odpověď na „${question}“ obsahuje ukázku, tabulku nebo seznam`);
      assert.ok(text.trim().split(/\n\s*\n/).length === 1, `${file}: odpověď na „${question}“ má víc odstavců`);
    }
  }
});

/** Osnova textu pro porovnání jazyků: úrovně nadpisů a počty bloků kódu, řádků tabulek, položek seznamů a odkazů. */
function textOutline(markdown) {
  const lines = markdown.replace(FENCED_BLOCK, '```').split('\n');
  return {
    headings: lines.flatMap((line) => /^(#+) /.exec(line)?.[1].length ?? []),
    codeBlocks: codeBlocks(markdown).length,
    tableRows: lines.filter((line) => line.startsWith('|')).length,
    listItems: lines.filter((line) => /^\s*([-*+]|\d+\.) /.test(line)).length,
    links: lines.join('\n').split('](').length - 1,
  };
}

/**
 * Porovná osnovu českých textů ve složce `subdir` s anglickými protějšky.
 * Text bez protějšku není chyba: protějšek může přijít později (ZADANI část 14)
 * a build ho do té doby vypisuje jako varování (test/build.test.mjs).
 */
async function assertSameOutline(subdir) {
  const english = new Map(await contentFiles(`en/${subdir}`));
  for (const [path, markdown] of await contentFiles(`cs/${subdir}`)) {
    const counterpart = path.replace(/^cs\//, 'en/');
    if (!english.has(counterpart)) continue;
    assert.deepEqual(textOutline(english.get(counterpart)), textOutline(markdown), `content/${path} a ${counterpart}`);
  }
}

test('česká a anglická kapitola úvodu mají stejnou osnovu', () => assertSameOutline('intro'));

test('jediný kontakt je adresa zákaznické péče v oddílu Podpora a oddíl říká, co k hlášení přiložit', async () => {
  const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
  for (const [file, spec] of await builtSpecs()) {
    const title = chapterTitle(file, 'errors');
    const section = languageOf(file) === 'en' ? 'Support' : 'Podpora';
    const chapter = introChapter(file, spec, title);
    const support = chapter.body.split(`\n## ${section}\n`)[1]?.split(/^## /m)[0].trim();
    assert.ok(support, `${file}: kapitola ${title} nemá oddíl ${section}`);
    assert.deepEqual([...new Set(support.match(email))], ['customercare@edsystem.cz'], file);
    for (const field of ['transactionId', 'fileName', 'state', 'stateChanged', 'errorCode', 'errorMessage']) {
      assert.ok(support.includes(`\`${field}\``), `${file}: oddíl ${section} nezmiňuje ${field}`);
    }
    const elsewhere = stringsOf({ ...spec, info: { ...spec.info, description: spec.info.description.replace(support, '') } });
    assert.deepEqual(elsewhere.flatMap((text) => text.match(email) ?? []), [], `${file}: e-mailová adresa mimo oddíl ${section}`);
  }
});

// Popisy pěti operací synchronizace katalogu (ZADANI část 7 a 14).

/** Smyšlený identifikátor v názvu katalogového souboru; skutečný v příkladech být nesmí (ZADANI část 7). */
const FICTIONAL_FILE_ID = '1000001';

/** Hodnoty pojmenovaných příkladů (`examples`) u typu obsahu. */
const exampleValues = (media) => Object.values(media.examples ?? {}).map(({ value }) => value);

test('popisy pěti operací dodržují osnovu šablony a česká i anglická verze mají stejnou osnovu', async () => {
  for (const [language, sections] of Object.entries(TEMPLATE_SECTIONS)) {
    for (const { file } of CATALOG_OPERATIONS) {
      const markdown = (await readFile(join(repoRoot, 'content', language, 'operations', file), 'utf8')).replace(FENCED_BLOCK, '```');
      const where = `content/${language}/operations/${file}`;
      assert.match(markdown, /^[^#\s]/, `${where}: popis nezačíná odstavcem o účelu operace`);
      const headings = [...markdown.matchAll(/^(#+) (.+)$/gm)].map(([, level, heading]) => `${level} ${heading}`);
      // Oddíly jen ze šablony, v jejím pořadí; oddíl bez obsahu smí chybět, příklad ne.
      assert.deepEqual(headings, sections.filter((section) => headings.includes(`## ${section}`)).map((section) => `## ${section}`), `${where}: oddíly nejsou podle šablony`);
      assert.ok(headings.includes(`## ${sections[2]}`), `${where}: chybí oddíl ${sections[2]}`);
    }
  }
  await assertSameOutline('operations');
});

test('build u pěti operací katalogu a číselníků nehlásí v žádném jazyce ani prostředí varování', () => {
  const paths = [...new Set(CATALOG_OPERATIONS.map(({ path }) => path))];
  assert.deepEqual(warnings.filter((message) => paths.some((path) => message.includes(path))), []);
});

test('každá z pěti operací má příklad požadavku na adresu API zvoleného prostředí a příklad odpovědi', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    for (const { method, path } of CATALOG_OPERATIONS) {
      const operation = spec.paths[path][method];
      const label = `${file}: ${method.toUpperCase()} ${path}`;
      // Příklad volá cestu s dosazenou hodnotou parametru, ověřuje se jen část před ním.
      const call = `curl -X ${method.toUpperCase()} '${environment.baseUrl}${path.replace(/\{\w+\}/g, '')}`;
      assert.ok(operation.description.includes(call), `${label}: popis nemá příklad ${call}…`);
      const [, success] = Object.entries(operation.responses).find(([status]) => status.startsWith('2'));
      // Katalogový soubor je binární ZIP; příklad odpovědi má smysl jen u JSON.
      const json = Object.entries(success.content).filter(([, media]) => media.schema.format !== 'binary');
      for (const [type, media] of json) assert.ok(Object.hasOwn(media, 'example') || Object.hasOwn(media, 'examples'), `${label}: odpověď ${type} nemá příklad`);
    }
    const bodies = spec.paths['/products/catalog'].post.requestBody.content;
    for (const [type, media] of Object.entries(bodies)) {
      const values = exampleValues(media);
      assert.ok(values.some((value) => value.catalogType === 'Full') && values.some((value) => value.catalogType === 'Update'), `${file}: tělo ${type} nemá příklad Full a Update`);
    }
  }
});

test('zjištění stavu jobu má příklady pro čekající job, zpracovávaný job a vygenerovaný soubor, vždy jako pole', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const { content } = spec.paths['/products/catalog'].get.responses[200];
    for (const [type, media] of Object.entries(content)) {
      const values = exampleValues(media);
      assert.ok(values.every(Array.isArray), `${file}: ${type}: příklad není pole`);
      assert.deepEqual(values.map((value) => value.map(({ state }) => state)), [['Undefined'], ['InProcess'], ['Generated']], `${file}: ${type}`);
      assert.match(values[2][0].fileName ?? '', /\.ZIP$/i, `${file}: ${type}: vygenerovaný soubor nemá fileName`);
    }
  }
});

test('název katalogového souboru nese v příkladech a popisech smyšlený identifikátor', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const ids = [...JSON.stringify(spec).matchAll(/pricelist_\d+_(\d+)_/g)].map(([, id]) => id);
    // Příklad odpovědi se stavem Generated, ukázka parametru fileName a příklad v popisu stažení.
    assert.ok(ids.length >= 3, `${file}: příklady nemají název katalogového souboru`);
    assert.deepEqual([...new Set(ids)], [FICTIONAL_FILE_ID], file);
  }
});

test('popis založení jobu říká, že pole regionMask, regionZeroIncluded a canceled se v popsané integraci neposílají', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const sentence = spec.paths['/products/catalog'].post.description.split(/(?<=\.)\s+/).find((candidate) => candidate.includes('`regionMask`'));
    assert.ok(sentence, `${file}: popis nezmiňuje regionMask`);
    for (const field of ['regionZeroIncluded', 'canceled']) assert.ok(sentence.includes(`\`${field}\``), `${file}: věta nezmiňuje ${field}`);
    assert.match(sentence, languageOf(file) === 'en' ? /are not sent/ : /se .*neposílají/, file);
  }
});

test('popis zjištění stavu jobu vysvětluje každý stav z výčtu a pro vyhodnocení odkazuje na Konec jobu', async () => {
  const endOfJob = { cs: 'konec-jobu', en: 'when-a-job-ends' };
  for (const [file, spec, environment] of await builtSpecs()) {
    const { description } = spec.paths['/products/catalog'].get;
    const states = spec.components.schemas.State.enum;
    assert.deepEqual(states.filter((state) => !new RegExp(`^\\| \`${state}\` +\\| \\S`, 'm').test(description)), [], `${file}: stavy bez vysvětlení`);
    assert.ok(description.includes(`](#${environment.slug}/description/${endOfJob[languageOf(file)]})`), `${file}: popis neodkazuje na Konec jobu`);
  }
});

// Anglická verze a české rozhraní Scalaru (ZADANI část 16).

// Text bez protějšku v druhém jazyce build jen vypíše jako varování; je to běžný
// stav, dokud překlad nepřijde (ZADANI část 14), proto ho tento test nehlídá.
test('build nehlásí žádný nepřeložený řetězec ze specifikace', () => {
  assert.deepEqual(warnings.filter((message) => /nepřeložené/.test(message)), []);
});

test('anglická specifikace má přeložené názvy operací, popisy vlastností i popis zabezpečení', async () => {
  for (const [file, spec, environment] of (await builtSpecs()).filter(([file]) => languageOf(file) === 'en')) {
    assert.equal(spec.paths['/codelists/currencies'].get.summary, 'Currency codelist', file);
    assert.equal(spec.components.schemas.AddressExternalModel.properties.city.description, 'City.', file);
    assert.match(spec.components.securitySchemes.oauth2.description, new RegExp(`^OAuth 2\\.0 .*\`${environment.tokenUrl.replaceAll('.', '\\.')}\``), file);
  }
});

/** Řetězce vnořeného objektu s překlady podle cesty klíčů (`search.open`). */
const leaves = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, item]) => (typeof item === 'string' ? [[`${prefix}${key}`, item]] : leaves(item, `${prefix}${key}.`)));

test('český překlad rozhraní Scalaru pokrývá každý anglický řetězec zafixované verze a nemá klíče navíc', async () => {
  // Po aktualizaci Scalaru test vyjmenuje řetězce, které přibyly; na webu zatím zůstanou anglicky.
  const { en } = await import('../node_modules/@scalar/api-reference/dist/features/localization/locales/en.js');
  const english = new Map(leaves(en));
  const czech = new Map(leaves(JSON.parse(await readFile(join(repoRoot, 'i18n/scalar.cs.json'), 'utf8'))));
  assert.deepEqual([...english.keys()].filter((key) => !czech.has(key)), [], 'řetězce bez českého překladu');
  assert.deepEqual([...czech.keys()].filter((key) => !english.has(key)), [], 'překlady, které Scalar nezná');
  for (const [key, text] of english) {
    for (const [placeholder] of text.matchAll(/\{\w+\}/g)) assert.ok(czech.get(key).includes(placeholder), `${key}: chybí ${placeholder}`);
  }
});

test('česká stránka nastaví Scalaru češtinu s překladem rozhraní, anglická angličtinu', async () => {
  const localization = async (page) => JSON.parse(/localization: (\{.*?\}),\n/s.exec(await read(page))[1]);
  assert.deepEqual(await localization('index.html'), { locale: 'cs', translations: JSON.parse(await readFile(join(repoRoot, 'i18n/scalar.cs.json'), 'utf8')) });
  assert.deepEqual(await localization('en/index.html'), { locale: 'en' });
});

test('záhlaví má tlačítko barevného režimu a přepínač jazyka CZ a EN, který vede na druhou verzi', async () => {
  const header = async (page) => /<header class="site-header"[^>]*>(.*?)<\/header>/s.exec(await read(page))[1];
  assert.match(await header('index.html'), /<a href="en\/" hreflang="en"[^>]*data-language-switch="en\/">EN<\/a>/);
  assert.match(await header('en/index.html'), /<a href="\.\.\/" hreflang="cs"[^>]*data-language-switch="\.\.\/">CZ<\/a>/);
  assert.match(await header('index.html'), /<button class="site-theme" type="button" aria-label="Tmavý režim" aria-pressed="false" data-theme-toggle>/);
  assert.match(await header('en/index.html'), /<button class="site-theme" type="button" aria-label="Dark mode" aria-pressed="false" data-theme-toggle>/);
});

test('texty, které česká stránka přepisuje, má Scalar zafixované verze opravdu napevno anglicky', async () => {
  // Po aktualizaci Scalaru test vyjmenuje texty, které už v balíčku nejsou; překlad pro ně je zbytečný.
  const scalar = await read('assets/scalar/standalone.js');
  const fixed = JSON.parse(await readFile(join(repoRoot, 'i18n/scalar-fixed.cs.json'), 'utf8'));
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const missing = Object.keys(fixed).filter((english) => {
    // {name} je v balíčku proměnná v šabloně řetězce: `Copy ${…} code`.
    const pattern = new RegExp(english.split('{name}').map(escape).join('\\$\\{[^}]+\\}'));
    return !pattern.test(scalar);
  });
  assert.deepEqual(missing, []);
  assert.ok(Object.values(fixed).every((czech) => typeof czech === 'string' && czech.trim() !== ''), 'prázdný překlad');
});

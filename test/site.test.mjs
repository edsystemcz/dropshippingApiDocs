// Sestaví web ze skutečných zdrojů repa (specifikace, overlay, šablona, písma,
// Scalar) a kontroluje, co se dostane do výstupu. Chování v prohlížeči (síť,
// úložiště) tím ověřené není; to se po změně nastavení nebo verze Scalaru
// ověřuje v prohlížeči.

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { build, siteInputs } from '../scripts/build.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = 'assets/fonts';
let outDir;

before(async () => {
  outDir = join(await mkdtemp(join(tmpdir(), 'site-')), 'dist');
  await build({ ...(await siteInputs(repoRoot)), outDir, log: { info: () => {}, warn: () => {} } });
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

test('stránky ani styl písem neodkazují na žádnou adresu s doménou', async () => {
  for (const path of ['index.html', 'en/index.html', `${FONT_DIR}/fonts.css`]) {
    const content = await read(path);
    // Odkaz, skript, styl ani písmo nesmí mít adresu se schématem nebo začínat lomítkem.
    const references = [...content.matchAll(/(?:href|src)="([^"]*)"|url\(([^)]*)\)/g)].map((match) => match[1] ?? match[2]);
    assert.ok(references.length > 0, `${path}: žádné odkazy ke kontrole`);
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
      await assert.doesNotReject(readFile(join(outDir, dir, reference)), `${page}: ${reference} ve výstupu chybí`);
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

// Specifikace po overlay: skutečné doplňky nad skutečnými zdrojovými specifikacemi.

const ENVIRONMENTS = JSON.parse(await readFile(join(repoRoot, 'environments.json'), 'utf8'));

/** Specifikace všech prostředí v obou jazykových verzích: `[popis, specifikace, prostředí]`. */
const builtSpecs = async () =>
  Promise.all(
    ENVIRONMENTS.flatMap((environment) =>
      ['', 'en/'].map(async (dir) => [`${dir}openapi.${environment.slug}.json`, JSON.parse(await read(`${dir}openapi.${environment.slug}.json`)), environment]),
    ),
  );

test('stažení katalogového souboru je v menu ve skupině Products', async () => {
  for (const [file, spec] of await builtSpecs()) {
    const download = spec.paths['/files/{fileName}']?.get;
    assert.ok(download, `${file}: chybí GET /files/{fileName}`);
    assert.deepEqual(download.tags, ['Products'], file);
    assert.deepEqual(download.parameters.map(({ name, in: location, required }) => [name, location, required]), [['fileName', 'path', true]], file);
    assert.ok(download.responses[200].content['application/zip'], `${file}: odpověď 200 není ZIP`);
  }
});

test('skupiny jsou v pořadí Info, Codelist, Products, OrdersB2C, OrdersB2B a mají zobrazované názvy', async () => {
  for (const [file, spec] of await builtSpecs()) {
    assert.deepEqual(
      spec.tags.map((tag) => [tag.name, tag['x-displayName']]),
      [
        ['Info', 'Stav služby'],
        ['Codelist', 'Číselníky'],
        ['Products', 'Katalog produktů'],
        ['OrdersB2C', 'Objednávky B2C'],
        ['OrdersB2B', 'Objednávky B2B'],
      ],
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
    '/Info': 'Vrátí stav a verzi služby.',
    '/codelists/ProductIndex': 'Číselník produktových indexů.',
    '/codelists/ProductBindingsType': 'Číselník typů příslušenství/náhrad.',
  };
  for (const [file, spec] of await builtSpecs()) {
    for (const [path, summary] of Object.entries(expected)) assert.equal(spec.paths[path].get.summary, summary, `${file}: GET ${path}`);
    assert.equal(spec.paths['/products/catalog'].post.summary, 'Generování dropship katalogu produktů asynchronně.', file);
  }
});

test('popisy adresy u číselníku mají správnou diakritiku', async () => {
  for (const [file, spec] of await builtSpecs()) {
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
    const notice = environment.notice?.[file.startsWith('en/') ? 'en' : 'cs'];
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

test('popis číselníku měn ukazuje v příkladu adresu API svého prostředí', async () => {
  for (const [file, spec, environment] of await builtSpecs()) {
    const { description } = spec.paths['/codelists/currencies'].get;
    assert.ok(description.includes(`'${environment.baseUrl}/codelists/currencies`), `${file}: příklad nevolá ${environment.baseUrl}`);
  }
});

test('šablona popisu operace existuje v obou jazycích, má jednotnou osnovu a na web se nedostane', async () => {
  const outline = {
    cs: ['Kdy ji volat', 'Na co si dát pozor', 'Příklad', 'Časté chyby'],
    en: ['When to call it', 'What to watch out for', 'Example', 'Common errors'],
  };
  for (const [language, sections] of Object.entries(outline)) {
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

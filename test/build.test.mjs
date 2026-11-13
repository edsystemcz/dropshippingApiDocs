import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build } from '../scripts/build.mjs';

const ENVIRONMENTS = [
  {
    slug: 'prod',
    title: 'Dropshipping API - PROD',
    default: true,
    baseUrl: 'https://api.example.cz',
    tokenUrl: 'https://auth.example.cz/oauth/token',
  },
  {
    slug: 'test',
    title: 'Dropshipping API - TEST',
    default: false,
    baseUrl: 'https://api-test.example.cz',
    tokenUrl: 'https://auth-test.example.cz/oauth/token',
  },
];

/** Nejmenší platná operace ve skupině `tag`; `fields` ji doplní nebo přepíší. */
const operation = (tag, fields = {}) => ({ tags: [tag], responses: { 200: { description: 'Success' } }, ...fields });

const sourceSpec = (title, paths = { '/Info': { get: operation('Info') } }, components) => ({
  openapi: '3.0.1',
  info: { title, version: 'v1' },
  paths,
  ...(components && { components }),
});

const TEMPLATE = '<html lang="{{lang}}"><title>{{pageTitle}}</title><script src="{{rootPath}}assets/app.js"></script><script>start({{sources}})</script></html>';

/** Logo, jak ho uloží grafický editor: s deklarací XML, typem dokumentu a jmennými prostory. */
const LOGO = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M0 0h10v10z" style="fill:currentColor"/></svg>\n';

/** Značka loga bez textu pro mobil, jak ji uloží grafický editor. */
const LOGO_SYMBOL = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg" xmlns:affinity="https://www.affinity.studio/"><path d="M0 0h17v10z" style="fill:#e0004d"/></svg>\n';

/**
 * Založí zdrojové složky s daným obsahem a vrátí vstupy pro build.
 * `theme` je obsah souboru s motivem; bez něj build žádný motiv nedostane.
 */
async function project({ specs, overlays = {}, template = TEMPLATE, assets = {}, content = {}, environments = ENVIRONMENTS, logo = LOGO, logoSymbol = LOGO_SYMBOL, theme, translations = {}, scalarTranslations = {}, scalarFixedTexts = {} }) {
  const dir = await mkdtemp(join(tmpdir(), 'build-'));
  const specDir = join(dir, 'spec');
  const overlayDir = join(dir, 'overlay');
  const siteDir = join(dir, 'site');
  const contentDir = join(dir, 'content');
  const i18nDir = join(dir, 'i18n');
  await mkdir(i18nDir);
  await writeFile(join(i18nDir, 'en.json'), typeof translations === 'string' ? translations : JSON.stringify(translations));
  await writeFile(join(i18nDir, 'scalar.cs.json'), JSON.stringify(scalarTranslations));
  await writeFile(join(i18nDir, 'scalar-fixed.cs.json'), JSON.stringify(scalarFixedTexts));
  for (const [path, text] of Object.entries(content)) {
    await mkdir(dirname(join(contentDir, path)), { recursive: true });
    await writeFile(join(contentDir, path), text);
  }
  await mkdir(specDir);
  await mkdir(overlayDir);
  await mkdir(siteDir);
  for (const [slug, spec] of Object.entries(specs)) {
    await writeFile(join(specDir, `swagger.${slug}.source.json`), JSON.stringify(spec));
  }
  for (const [name, overlay] of Object.entries(overlays)) {
    await writeFile(join(overlayDir, name), typeof overlay === 'string' ? overlay : JSON.stringify(overlay));
  }
  await writeFile(join(siteDir, 'index.html'), template);
  await writeFile(join(dir, 'logo.svg'), logo);
  await writeFile(join(dir, 'logo-symbol.svg'), logoSymbol);
  if (theme !== undefined) await writeFile(join(dir, 'theme.css'), theme);
  const assetList = [];
  for (const [to, bytes] of Object.entries(assets)) {
    const from = join(dir, `asset-${assetList.length}`);
    await writeFile(from, bytes);
    assetList.push({ from, to });
  }
  return {
    environments,
    specDir,
    overlayDir,
    contentDir,
    siteDir,
    i18nDir,
    outDir: join(dir, 'dist'),
    assets: assetList,
    logo: join(dir, 'logo.svg'),
    logoSymbol: join(dir, 'logo-symbol.svg'),
    ...(theme !== undefined && { theme: join(dir, 'theme.css') }),
  };
}

async function run(inputs) {
  const lines = [];
  const log = { info: (m) => lines.push(`INFO ${m}`), warn: (m) => lines.push(`WARN ${m}`) };
  await build({ ...inputs, log });
  return { output: lines.join('\n') };
}

const readJson = async (...path) => JSON.parse(await readFile(join(...path), 'utf8'));

const bothAt = (build) => ({
  prod: sourceSpec(`Dropshipping API Gateway service, build: ${build}`),
  test: sourceSpec(`Dropshipping API Gateway service, build: ${build}`),
});

test('specifikace prostředí má v titulku název prostředí a číslo buildu ve verzi', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123'),
    },
  });

  await run(inputs);

  const prod = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.equal(prod.info.title, 'Dropshipping API - PROD');
  assert.equal(prod.info.version, '1.1.122');
  const test = await readJson(inputs.outDir, 'openapi.test.json');
  assert.equal(test.info.title, 'Dropshipping API - TEST');
  assert.equal(test.info.version, '1.1.123');
});

test('operace ze zdrojové specifikace přejdou do výstupu beze změny', async () => {
  const paths = {
    '/Info': { get: operation('Info') },
    '/codelists/ProductCategory': { get: operation('Codelist', { summary: 'Číselník kategorií' }) },
    '/b2b/orders': { get: operation('OrdersB2B'), post: operation('OrdersB2B') },
  };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths);
  const inputs = await project({ specs: { prod: spec, test: spec } });

  await run(inputs);

  assert.deepEqual((await readJson(inputs.outDir, 'openapi.prod.json')).paths, paths);
  assert.deepEqual((await readJson(inputs.outDir, 'en', 'openapi.test.json')).paths, paths);
});

test('když číslo buildu nejde z titulku vyčíst, build vypíše varování, nespadne a verze zůstane v1', async () => {
  const inputs = await project({
    specs: { ...bothAt('1.1.122'), test: sourceSpec('Dropshipping API Gateway service') },
  });

  const { output } = await run(inputs);

  assert.match(output, /WARN TEST: .*číslo buildu/);
  assert.doesNotMatch(output, /WARN PROD/);
  assert.equal((await readJson(inputs.outDir, 'openapi.test.json')).info.version, 'v1');
  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).info.version, '1.1.122');
});

test('česká verze je v kořeni a anglická ve složce en/, obě se specifikacemi všech prostředí', async () => {
  const inputs = await project({ specs: bothAt('1.1.122') });

  await run(inputs);

  for (const dir of [inputs.outDir, join(inputs.outDir, 'en')]) {
    assert.equal((await readJson(dir, 'openapi.prod.json')).info.title, 'Dropshipping API - PROD');
    assert.equal((await readJson(dir, 'openapi.test.json')).info.title, 'Dropshipping API - TEST');
  }
  assert.match(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), /<html lang="cs">/);
  assert.match(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), /<html lang="en">/);
});

/** Seznam prostředí, který stránka předává Scalaru. */
const sourcesOf = async (...path) =>
  JSON.parse(/start\((.*?)\)<\/script>/s.exec(await readFile(join(...path, 'index.html'), 'utf8'))[1]);

test('stránka nabízí všechna prostředí s relativní adresou specifikace a výchozím PROD', async () => {
  const inputs = await project({ specs: bothAt('1.1.122') });

  await run(inputs);

  const expected = [
    { title: 'Dropshipping API - PROD', slug: 'prod', url: 'openapi.prod.json', default: true },
    { title: 'Dropshipping API - TEST', slug: 'test', url: 'openapi.test.json', default: false },
  ];
  assert.deepEqual(await sourcesOf(inputs.outDir), expected);
  assert.deepEqual(await sourcesOf(inputs.outDir, 'en'), expected);
});

test('cesty ke společným souborům jsou relativní, takže web funguje i v podsložce', async () => {
  const inputs = await project({ specs: bothAt('1.1.122') });

  await run(inputs);

  assert.match(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), /<script src="assets\/app\.js">/);
  assert.match(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), /<script src="\.\.\/assets\/app\.js">/);
});

test('titulek stránky je v jazyce dané verze', async () => {
  const inputs = await project({ specs: bothAt('1.1.122') });

  await run(inputs);

  assert.match(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), /<title>Dropshipping API dokumentace \| eD system<\/title>/);
  assert.match(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), /<title>Dropshipping API documentation \| eD system<\/title>/);
});

test('logo i jeho značka pro mobil se vloží do stránky jako SVG bez deklarace XML, typu dokumentu a jmenných prostorů, aby převzaly barvu textu', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), template: '<html lang="{{lang}}"><a href="#">{{logo}}{{logoSymbol}}</a></html>' });

  await run(inputs);

  for (const dir of [inputs.outDir, join(inputs.outDir, 'en')]) {
    assert.equal(
      await readFile(join(dir, 'index.html'), 'utf8'),
      `<html lang="${dir === inputs.outDir ? 'cs' : 'en'}"><a href="#"><svg viewBox="0 0 10 10"><path d="M0 0h10v10z" style="fill:currentColor"/></svg><svg viewBox="0 0 17 10"><path d="M0 0h17v10z" style="fill:#e0004d"/></svg></a></html>`,
    );
  }
});

const THEMED_TEMPLATE = '<head>{{themeStyles}}</head>';

test('motiv se zkopíruje na web a stránky na něj odkazují relativně', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), template: THEMED_TEMPLATE, theme: '.light-mode { --scalar-color-1: #4c4f69; }' });

  await run(inputs);

  assert.equal(await readFile(join(inputs.outDir, 'assets', 'theme.css'), 'utf8'), '.light-mode { --scalar-color-1: #4c4f69; }');
  assert.equal(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), '<head><link rel="stylesheet" href="assets/theme.css"></head>');
  assert.equal(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), '<head><link rel="stylesheet" href="../assets/theme.css"></head>');
});

test('bez motivu build projde a stránky žádný motiv nenačítají', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), template: THEMED_TEMPLATE });

  await run(inputs);

  assert.ok(!(await listFiles(inputs.outDir)).includes('assets/theme.css'));
  assert.equal(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), '<head></head>');
  assert.equal(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), '<head></head>');
});

test('neznámý zástupný symbol v šabloně stránky shodí build', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), template: '<html lang="{{lang}}">{{neznamy}}</html>' });

  await assert.rejects(run(inputs), /neznamy/);
});

/** Všechny soubory ve složce včetně podsložek, cesty relativně k ní. */
const listFiles = async (dir) =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();

test('do výstupu se dostanou jen vyjmenované soubory, i když ve výstupu a ve zdrojích leží další', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    assets: { 'assets/app.js': 'start = () => {}', 'assets/fonts/inter.woff2': 'písmo' },
  });
  await writeFile(join(inputs.siteDir, 'poznamky.txt'), 'nepatří na web');
  await mkdir(join(inputs.outDir, 'stare'), { recursive: true });
  await writeFile(join(inputs.outDir, 'stare', 'zbytek.html'), 'z minulého buildu');

  await run(inputs);

  assert.deepEqual(await listFiles(inputs.outDir), [
    'assets/app.js',
    'assets/fonts/inter.woff2',
    'en/index.html',
    'en/openapi.prod.json',
    'en/openapi.test.json',
    'index.html',
    'openapi.prod.json',
    'openapi.test.json',
  ]);
  assert.equal(await readFile(join(inputs.outDir, 'assets', 'fonts', 'inter.woff2'), 'utf8'), 'písmo');
});

test('build vypíše pro každé prostředí číslo buildu a počet operací', async () => {
  const paths = {
    '/Info': { get: operation('Info') },
    '/b2b/orders': { get: operation('OrdersB2B'), post: operation('OrdersB2B'), parameters: [] },
  };
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', paths),
    },
  });

  const { output } = await run(inputs);

  assert.match(output, /INFO PROD: build 1\.1\.122, operací: 1$/m);
  assert.match(output, /INFO TEST: build 1\.1\.123, operací: 3$/m);
});

test('chybějící společný soubor shodí build dřív, než sáhne na výstup z minulého buildu', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), assets: { 'assets/app.js': 'start = () => {}' } });
  await run(inputs);
  const before = await listFiles(inputs.outDir);

  const missing = { from: join(inputs.siteDir, 'neexistuje.woff2'), to: 'assets/fonts/neexistuje.woff2' };
  await assert.rejects(run({ ...inputs, assets: [...inputs.assets, missing] }), { code: 'ENOENT' });

  assert.deepEqual(await listFiles(inputs.outDir), before);
});

// Overlay: doplňky ze složky overlay/ se slučují do specifikace každého prostředí.

const twoOperations = () => ({
  '/Info': { get: operation('Info') },
  '/codelists/ProductIndex': { get: operation('Codelist', { summary: 'Vraci indexy produktu.', operationId: 'GetProductListIndexAsync' }) },
});

test('doplněk z overlay se sloučí do operace v každém prostředí a zbytek operace zůstane', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', twoOperations());
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: { 'base.json': { paths: { '/codelists/ProductIndex': { get: { summary: 'Číselník produktových indexů.' } } } } },
  });

  await run(inputs);

  for (const slug of ['prod', 'test']) {
    assert.deepEqual((await readJson(inputs.outDir, `openapi.${slug}.json`)).paths['/codelists/ProductIndex'].get, {
      tags: ['Codelist'],
      responses: { 200: { description: 'Success' } },
      summary: 'Číselník produktových indexů',
      operationId: 'GetProductListIndexAsync',
    });
  }
});

test('soubory overlay se slučují v abecedním pořadí, pozdější doplněk vyhrává', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', twoOperations());
  const patch = (summary) => ({ paths: { '/codelists/ProductIndex': { get: { summary } } } });
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: { 'products.json': patch('Ze souboru products.'), 'base.json': patch('Ze souboru base.') },
  });

  await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).paths['/codelists/ProductIndex'].get.summary, 'Ze souboru products');
});

test('null v doplňku klíč odstraní, takže odkaz na schéma jde nahradit polem', async () => {
  const catalog = { $ref: '#/components/schemas/ProductCatalogModel' };
  const paths = {
    '/products/catalog': {
      get: operation('Products', { responses: { 200: { description: 'Success', content: { 'application/json': { schema: catalog } } } } }),
    },
  };
  const components = { schemas: { ProductCatalogModel: { type: 'object' } } };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths, components);
  const asArray = { $ref: null, type: 'array', items: catalog };
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: {
      'products.json': {
        paths: { '/products/catalog': { get: { responses: { 200: { content: { 'application/json': { schema: asArray } } } } } } },
      },
    },
  });

  await run(inputs);

  const response = (await readJson(inputs.outDir, 'openapi.test.json')).paths['/products/catalog'].get.responses[200];
  assert.deepEqual(response, {
    description: 'Success',
    content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ProductCatalogModel' } } } },
  });
});

test('doplněk pro operaci, která v prostředí není, se tam přeskočí a jinde se použije', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', twoOperations()),
    },
    overlays: { 'base.json': { paths: { '/codelists/ProductIndex': { get: { summary: 'Číselník produktových indexů.' } } } } },
  });

  const { output } = await run(inputs);

  assert.deepEqual(Object.keys((await readJson(inputs.outDir, 'openapi.prod.json')).paths), ['/Info']);
  assert.equal((await readJson(inputs.outDir, 'openapi.test.json')).paths['/codelists/ProductIndex'].get.summary, 'Číselník produktových indexů');
  assert.match(output, /^INFO PROD: .*overlay\/base\.json.*GET \/codelists\/ProductIndex/m);
});

test('doplněk pro operaci, která není v žádném prostředí, shodí build a nic nezapíše', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122');
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: {
      'base.json': {
        paths: {
          '/Info': { get: { summary: 'Vrátí stav a verzi služby.' } },
          '/codelists/ProductIndex': { get: { summary: 'Číselník produktových indexů.' } },
        },
      },
    },
  });

  await assert.rejects(run(inputs), /overlay\/base\.json: GET \/codelists\/ProductIndex/);
  await assert.rejects(readFile(join(inputs.outDir, 'openapi.prod.json')), { code: 'ENOENT' });
});

const downloadOperation = {
  tags: ['Products'],
  summary: 'Stažení katalogového souboru',
  parameters: [{ name: 'fileName', in: 'path', required: true, schema: { type: 'string' } }],
  responses: { 200: { description: 'Katalogový soubor.' } },
};

test('nová operace z overlay se přidá do každého prostředí', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', twoOperations()),
    },
    overlays: { 'products.json': { newPaths: { '/files/{fileName}': { get: downloadOperation } } } },
  });

  await run(inputs);

  for (const slug of ['prod', 'test']) {
    assert.deepEqual((await readJson(inputs.outDir, `openapi.${slug}.json`)).paths['/files/{fileName}'], { get: downloadOperation });
  }
});

test('nová operace, kterou backend mezitím přidal, se jen doplní a build varuje', async () => {
  const fromBackend = { get: operation('Products', { operationId: 'GetFileAsync', summary: 'Vrátí soubor.' }) };
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', { ...twoOperations(), '/files/{fileName}': fromBackend }),
    },
    overlays: { 'products.json': { newPaths: { '/files/{fileName}': { get: downloadOperation } } } },
  });

  const { output } = await run(inputs);

  assert.deepEqual((await readJson(inputs.outDir, 'openapi.test.json')).paths['/files/{fileName}'].get, {
    ...downloadOperation,
    operationId: 'GetFileAsync',
  });
  assert.match(output, /^WARN TEST: .*overlay\/products\.json.*GET \/files\/\{fileName\}/m);
  assert.doesNotMatch(output, /WARN PROD/);
});

test('zástupné symboly v overlay dostanou hodnoty svého prostředí, takže servery míří na jeho API', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: {
      'base.json': {
        servers: [{ url: '{{baseUrl}}' }],
        paths: { '/Info': { get: { description: 'Token z {{tokenUrl}}, kolekce postman.{{envSlug}}.json.' } } },
      },
    },
  });

  await run(inputs);

  const prod = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.deepEqual(prod.servers, [{ url: 'https://api.example.cz' }]);
  assert.equal(prod.paths['/Info'].get.description, 'Token z https://auth.example.cz/oauth/token, kolekce postman.prod.json.');
  const test = await readJson(inputs.outDir, 'en', 'openapi.test.json');
  assert.deepEqual(test.servers, [{ url: 'https://api-test.example.cz' }]);
  assert.equal(test.paths['/Info'].get.description, 'Token z https://auth-test.example.cz/oauth/token, kolekce postman.test.json.');
});

test('neznámý zástupný symbol v overlay shodí build', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'base.json': { servers: [{ url: '{{apiUrl}}' }] } },
  });

  await assert.rejects(run(inputs), /overlay\/base\.json.*\{\{apiUrl\}\}/);
});

test('skupiny z overlay určují pořadí a zobrazované názvy; v prostředí bez operací skupiny se vynechají', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', twoOperations()),
    },
    overlays: {
      'base.json': {
        tags: [
          { name: 'Info', 'x-displayName': 'Stav služby' },
          { name: 'Codelist', 'x-displayName': 'Číselníky' },
        ],
      },
    },
  });

  const { output } = await run(inputs);

  assert.deepEqual((await readJson(inputs.outDir, 'openapi.test.json')).tags, [
    { name: 'Info', 'x-displayName': 'Stav služby' },
    { name: 'Codelist', 'x-displayName': 'Číselníky' },
  ]);
  assert.deepEqual((await readJson(inputs.outDir, 'openapi.prod.json')).tags, [{ name: 'Info', 'x-displayName': 'Stav služby' }]);
  assert.match(output, /^INFO PROD: .*overlay\/base\.json.*skupin.*Codelist/m);
});

test('skupina z overlay, která není v žádném prostředí, shodí build', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'base.json': { tags: [{ name: 'Info' }, { name: 'Codelists', 'x-displayName': 'Číselníky' }] } },
  });

  await assert.rejects(run(inputs), /overlay\/base\.json: skupina Codelists/);
});

const addressSchema = () => ({
  AddressExternalModel: {
    type: 'object',
    properties: { city: { type: 'string', description: 'Mìsto.' }, zipCode: { type: 'string', description: 'PSÈ.' } },
  },
});

test('doplněk komponenty se sloučí tam, kde komponenta je, a jinde se přeskočí', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', undefined, { schemas: addressSchema() }),
    },
    overlays: {
      'base.json': {
        components: { schemas: { AddressExternalModel: { properties: { city: { description: 'Město.' }, zipCode: { description: 'PSČ.' } } } } },
      },
    },
  });

  const { output } = await run(inputs);

  assert.deepEqual((await readJson(inputs.outDir, 'openapi.test.json')).components.schemas.AddressExternalModel.properties, {
    city: { type: 'string', description: 'Město.' },
    zipCode: { type: 'string', description: 'PSČ.' },
  });
  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).components, undefined);
  assert.match(output, /^INFO PROD: .*overlay\/base\.json.*schemas\/AddressExternalModel/m);
});

test('doplněk komponenty, která není v žádném prostředí, shodí build', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', undefined, {
    securitySchemes: { oauth2: { type: 'http', scheme: 'Bearer', description: 'Vlož token do textboxu.' } },
  });
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: { 'base.json': { components: { securitySchemes: { bearer: { description: 'Přístupový token.' } } } } },
  });

  await assert.rejects(run(inputs), /overlay\/base\.json: components\/securitySchemes\/bearer/);
});

// Názvy schémat: na webu jen poslední část za tečkou, bez interních předpon.

const CATALOG = 'Elinkx.Dropship.Api.Web.Models.Products.ProductCatalogModel';
const STATE = 'Elinkx.Esyco.Services.Core.Db.Utilities.State';
const PROBLEM = 'Microsoft.AspNetCore.Mvc.ProblemDetails';
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });

const catalogPaths = () => ({
  '/products/catalog': {
    get: operation('Products', {
      responses: {
        200: { description: 'Success', content: json(ref(CATALOG)) },
        401: { description: 'Unauthorized', content: json({ type: 'array', items: ref(PROBLEM) }) },
      },
    }),
  },
});
const catalogSchemas = () => ({
  [CATALOG]: { type: 'object', properties: { state: ref(STATE), fileName: { type: 'string' } } },
  [STATE]: { type: 'string', enum: ['Waiting', 'Generated'] },
  [PROBLEM]: { type: 'object' },
});

test('názvy schémat se zkrátí na poslední část za tečkou včetně všech odkazů a overlay píše krátké názvy', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', catalogPaths(), { schemas: catalogSchemas() });
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: { 'products.json': { components: { schemas: { ProductCatalogModel: { description: 'Stav jobu.' } } } } },
  });

  await run(inputs);

  const result = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.deepEqual(result.components.schemas, {
    ProductCatalogModel: {
      type: 'object',
      properties: { state: ref('State'), fileName: { type: 'string' } },
      description: 'Stav jobu.',
    },
    State: { type: 'string', enum: ['Waiting', 'Generated'] },
    ProblemDetails: { type: 'object' },
  });
  assert.deepEqual(result.paths['/products/catalog'].get.responses, {
    200: { description: 'Success', content: json(ref('ProductCatalogModel')) },
    401: { description: 'Unauthorized', content: json({ type: 'array', items: ref('ProblemDetails') }) },
  });
});

const CODELIST_UNIT = 'Elinkx.Dropship.Api.Web.Models.Codelist.ProductUnitModel';
const PRODUCTS_UNIT = 'Elinkx.Dropship.Api.Web.Models.Products.ProductUnitModel';

const unitSpec = (build) =>
  sourceSpec(
    `Dropshipping API Gateway service, build: ${build}`,
    {
      '/codelists/productUnits': { get: operation('Codelist', { responses: { 200: { description: 'Success', content: json({ type: 'array', items: ref(CODELIST_UNIT) }) } } }) },
      '/products/{productId}': { get: operation('Products', { responses: { 200: { description: 'Success', content: json(ref('Elinkx.Dropship.Api.Web.Models.Products.ProductModel')) } } }) },
    },
    {
      schemas: {
        [CODELIST_UNIT]: { type: 'object', description: 'Měrná jednotka produktu' },
        'Elinkx.Dropship.Api.Web.Models.Products.ProductModel': { type: 'object', properties: { unit: ref(PRODUCTS_UNIT) } },
        [PRODUCTS_UNIT]: { type: 'object', description: 'Informace o jednotce množství.' },
      },
    },
  );

test('dvě schémata se stejnou poslední částí názvu shodí build a hlášení řekne, co doplnit do overlay', async () => {
  const inputs = await project({ specs: { prod: unitSpec('1.1.122'), test: unitSpec('1.1.122') } });

  await assert.rejects(run(inputs), (error) => {
    assert.match(error.message, /ProductUnitModel/);
    assert.ok(error.message.includes(CODELIST_UNIT) && error.message.includes(PRODUCTS_UNIT), error.message);
    assert.match(error.message, /schemaNames/);
    return true;
  });
  await assert.rejects(readFile(join(inputs.outDir, 'openapi.prod.json')), { code: 'ENOENT' });
});

test('vlastní název schématu z overlay kolizi vyřeší a odkazy vedou na správné schéma', async () => {
  const inputs = await project({
    specs: { prod: unitSpec('1.1.122'), test: unitSpec('1.1.122') },
    overlays: { 'base.json': { schemaNames: { [CODELIST_UNIT]: 'CodelistProductUnitModel' } } },
  });

  await run(inputs);

  const result = await readJson(inputs.outDir, 'openapi.test.json');
  assert.deepEqual(Object.keys(result.components.schemas).sort(), ['CodelistProductUnitModel', 'ProductModel', 'ProductUnitModel']);
  assert.equal(result.components.schemas.CodelistProductUnitModel.description, 'Měrná jednotka produktu');
  assert.equal(result.components.schemas.ProductUnitModel.description, 'Informace o jednotce množství.');
  assert.deepEqual(result.paths['/codelists/productUnits'].get.responses[200].content, json({ type: 'array', items: ref('CodelistProductUnitModel') }));
  assert.deepEqual(result.components.schemas.ProductModel.properties.unit, ref('ProductUnitModel'));
  assert.equal(result.schemaNames, undefined);
});

test('vlastní název pro schéma, které není v žádném prostředí, shodí build', async () => {
  const inputs = await project({
    specs: { prod: unitSpec('1.1.122'), test: unitSpec('1.1.122') },
    overlays: {
      'base.json': {
        schemaNames: { [CODELIST_UNIT]: 'CodelistProductUnitModel', 'Elinkx.Dropship.Api.Web.Models.Codelist.UnitModel': 'CodelistUnitModel' },
      },
    },
  });

  await assert.rejects(run(inputs), /overlay\/base\.json: schemaNames\/Elinkx\.Dropship\.Api\.Web\.Models\.Codelist\.UnitModel/);
});

// Validace: výsledná specifikace každého prostředí musí být platné OpenAPI.

test('neplatná výsledná specifikace shodí build s místem chyby a nic nezapíše', async () => {
  const withoutRequired = { ...downloadOperation, parameters: [{ name: 'fileName', in: 'path', schema: { type: 'string' } }] };
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'products.json': { newPaths: { '/files/{fileName}': { get: withoutRequired } } } },
  });

  await assert.rejects(run(inputs), (error) => {
    assert.match(error.message, /PROD: .*OpenAPI/);
    assert.match(error.message, /\/paths\/~1files~1\{fileName\}\/get\/parameters\/0/);
    return true;
  });
  await assert.rejects(readFile(join(inputs.outDir, 'openapi.prod.json')), { code: 'ENOENT' });
});

test('odkaz na neexistující schéma shodí build', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'base.json': { paths: { '/Info': { get: { responses: { 200: { content: json(ref(CATALOG)) } } } } } } },
  });

  await assert.rejects(run(inputs), /PROD: .*OpenAPI[\s\S]*ProductCatalogModel/);
});

test('hlavička odpovědi bez schématu dostane schéma řetězce, aby specifikace prošla validací', async () => {
  const header = { description: 'Contains reason of 401 result - https://tools.ietf.org/html/rfc6750#section-3' };
  const paths = {
    '/b2b/orders': {
      get: operation('OrdersB2B', {
        responses: { 200: { description: 'Success' }, 401: { description: 'Unauthorized', headers: { 'WWW-Authenticate': header } } },
      }),
    },
  };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths);
  const inputs = await project({ specs: { prod: spec, test: spec } });

  await run(inputs);

  assert.deepEqual((await readJson(inputs.outDir, 'openapi.prod.json')).paths['/b2b/orders'].get.responses[401].headers, {
    'WWW-Authenticate': { ...header, schema: { type: 'string' } },
  });
});

test('klíč v paths overlay, který není metoda HTTP, shodí build', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'base.json': { paths: { '/Info': { gett: { summary: 'Vrátí stav a verzi služby.' } } } } },
  });

  await assert.rejects(run(inputs), /overlay\/base\.json: .*\/Info.*gett/);
});

test('neplatný JSON v overlay shodí build s názvem souboru', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), overlays: { 'products.json': '{ "paths": ' } });

  await assert.rejects(run(inputs), /overlay\/products\.json/);
});

test('počet operací ve výpisu zahrnuje operace doplněné z overlay', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'products.json': { newPaths: { '/files/{fileName}': { get: downloadOperation } } } },
  });

  const { output } = await run(inputs);

  assert.match(output, /^INFO PROD: build 1\.1\.122, operací: 2$/m);
});

// Texty: soubory z content/<jazyk>/ build vkládá do specifikace každého prostředí.

test('úvod se složí z kapitol v pořadí podle názvů souborů, v každém jazyce ze svých textů', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: {
      'cs/intro/20-autentizace.md': '# Autentizace\n\nToken se posílá v hlavičce.\n',
      'cs/intro/10-uvod.md': '# Úvod\n\nK čemu API slouží.\n\n## Přehled operací\n\nTabulka.\n',
      'en/intro/10-introduction.md': '# Introduction\n\nWhat the API is for.\n',
    },
  });

  await run(inputs);

  for (const slug of ['prod', 'test']) {
    assert.equal(
      (await readJson(inputs.outDir, `openapi.${slug}.json`)).info.description,
      '# Úvod\n\nK čemu API slouží.\n\n## Přehled operací\n\nTabulka.\n\n# Autentizace\n\nToken se posílá v hlavičce.',
    );
    assert.equal((await readJson(inputs.outDir, 'en', `openapi.${slug}.json`)).info.description, '# Introduction\n\nWhat the API is for.');
  }
});

const catalogOperations = () => ({
  '/Info': { get: operation('Info') },
  '/codelists/ProductCategory': { get: operation('Codelist') },
  '/products/catalog': { get: operation('Products'), post: operation('Products') },
  '/files/{fileName}': { get: downloadOperation },
});

test('text skupiny se páruje podle technického názvu skupiny, ne podle zobrazovaného', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', catalogOperations());
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: { 'base.json': { tags: [{ name: 'Info' }, { name: 'Products', 'x-displayName': 'Katalog produktů' }] } },
    content: {
      'cs/tags/Products.md': 'Generování a stažení katalogu.\n',
      'cs/tags/Codelist.md': 'Číselníky.\n',
    },
  });

  await run(inputs);

  // Skupina, kterou overlay neuvádí, se zařadí za uvedené.
  assert.deepEqual((await readJson(inputs.outDir, 'openapi.test.json')).tags, [
    { name: 'Info' },
    { name: 'Products', 'x-displayName': 'Katalog produktů', description: 'Generování a stažení katalogu.' },
    { name: 'Codelist', description: 'Číselníky.' },
  ]);
  assert.deepEqual((await readJson(inputs.outDir, 'en', 'openapi.test.json')).tags, [
    { name: 'Info' },
    { name: 'Products', 'x-displayName': 'Katalog produktů' },
  ]);
});

test('popis operace se páruje podle metody a cesty včetně velikosti písmen', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', catalogOperations());
  const inputs = await project({
    specs: { prod: spec, test: spec },
    content: {
      'cs/operations/get__Info.md': 'Stav služby.\n',
      'cs/operations/get__codelists_ProductCategory.md': 'Kategorie.\n',
      'cs/operations/post__products_catalog.md': 'Založení jobu.\n',
      'cs/operations/get__files_{fileName}.md': 'Stažení katalogového souboru.\n',
    },
  });

  await run(inputs);

  const { paths } = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.equal(paths['/Info'].get.description, 'Stav služby.');
  assert.equal(paths['/codelists/ProductCategory'].get.description, 'Kategorie.');
  assert.equal(paths['/products/catalog'].post.description, 'Založení jobu.');
  assert.equal(paths['/products/catalog'].get.description, undefined);
  assert.equal(paths['/files/{fileName}'].get.description, 'Stažení katalogového souboru.');
  assert.equal((await readJson(inputs.outDir, 'en', 'openapi.prod.json')).paths['/Info'].get.description, undefined);
});

test('osiřelý popis operace shodí build, pojmenuje soubor a nic nezapíše', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: {
      'cs/operations/get__Info.md': 'Stav služby.\n',
      'cs/operations/get__products_catalog.md': 'Stav jobu.\n',
    },
  });

  await assert.rejects(run(inputs), (error) => {
    assert.match(error.message, /Osiřelé texty/);
    assert.match(error.message, /content\/cs\/operations\/get__products_catalog\.md/);
    assert.doesNotMatch(error.message, /get__Info\.md/);
    return true;
  });
  await assert.rejects(readFile(join(inputs.outDir, 'openapi.prod.json')), { code: 'ENOENT' });
});

test('popis operace s jinou velikostí písmen než cesta je osiřelý a hlášení poradí správný název', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), content: { 'en/operations/get__info.md': 'Service status.\n' } });

  await assert.rejects(run(inputs), /content\/en\/operations\/get__info\.md.*get__Info\.md/);
});

test('osiřelý text skupiny shodí build', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), content: { 'cs/tags/Info.md': 'Stav služby.\n', 'cs/tags/Orders.md': 'Objednávky.\n' } });

  await assert.rejects(run(inputs), (error) => {
    assert.match(error.message, /content\/cs\/tags\/Orders\.md/);
    assert.doesNotMatch(error.message, /tags\/Info\.md/);
    return true;
  });
});

test('text k operaci a skupině, které jsou jen v jednom prostředí, se vloží jen tam a build projde', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', twoOperations()),
    },
    content: {
      'cs/operations/get__codelists_ProductIndex.md': 'Produktové indexy.\n',
      'cs/tags/Codelist.md': 'Číselníky.\n',
    },
  });

  await run(inputs);

  const test = await readJson(inputs.outDir, 'openapi.test.json');
  assert.equal(test.paths['/codelists/ProductIndex'].get.description, 'Produktové indexy.');
  assert.deepEqual(test.tags, [{ name: 'Codelist', description: 'Číselníky.' }]);
  const prod = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.deepEqual(Object.keys(prod.paths), ['/Info']);
  assert.equal(prod.tags, undefined);
});

test('soubor, který není text úvodu, skupiny ani operace, shodí build; šablona s podtržítkem a skryté soubory se přeskočí', async () => {
  const content = {
    'cs/_sablona-operace.md': '# Šablona\n\n[odkaz](nikam.md) {{cokoli}}\n',
    'cs/operations/get__Info.md': 'Stav služby.\n',
    'cs/operations/.DS_Store': 'soubor systému',
    'cs/tags/.gitkeep': '',
  };
  const valid = await project({ specs: bothAt('1.1.122'), content });
  await run(valid);
  assert.equal((await readJson(valid.outDir, 'openapi.prod.json')).paths['/Info'].get.description, 'Stav služby.');

  for (const stray of ['cs/poznamky.md', 'cs/operations/get__Info.txt', 'cs/operations/katalog/get__Info.md', 'cs/tagy/Info.md']) {
    const inputs = await project({ specs: bothAt('1.1.122'), content: { ...content, [stray]: 'Text.\n' } });
    await assert.rejects(run(inputs), new RegExp(`content/${stray.replaceAll('.', '\\.')}`), stray);
  }
});

test('zástupné symboly v textech dostanou hodnoty svého prostředí, i uvnitř ukázek kódu', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\nAdresa API je `{{baseUrl}}`, kolekce [ke stažení](postman.{{envSlug}}.json).\n',
      'cs/tags/Info.md': 'Token vydává {{tokenUrl}}.\n',
      'cs/operations/get__Info.md': '```bash\ncurl {{baseUrl}}/Info\n```\n',
    },
  });

  await run(inputs);

  const prod = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.equal(prod.info.description, '# Úvod\n\nAdresa API je `https://api.example.cz`, kolekce [ke stažení](postman.prod.json).');
  assert.equal(prod.tags[0].description, 'Token vydává https://auth.example.cz/oauth/token.');
  assert.equal(prod.paths['/Info'].get.description, '```bash\ncurl https://api.example.cz/Info\n```');
  const test = await readJson(inputs.outDir, 'openapi.test.json');
  assert.equal(test.info.description, '# Úvod\n\nAdresa API je `https://api-test.example.cz`, kolekce [ke stažení](postman.test.json).');
  assert.equal(test.tags[0].description, 'Token vydává https://auth-test.example.cz/oauth/token.');
  assert.equal(test.paths['/Info'].get.description, '```bash\ncurl https://api-test.example.cz/Info\n```');
});

test('neznámý zástupný symbol v textu shodí build a hlášení pojmenuje soubor', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: { 'en/operations/get__Info.md': 'Call {{apiUrl}}/Info.\n' },
  });

  await assert.rejects(run(inputs), /content\/en\/operations\/get__Info\.md.*\{\{apiUrl\}\}/);

  for (const symbol of ['{{ baseUrl }}', '{{base-url}}', '{{base.url}}', '{{}}']) {
    const other = await project({ specs: bothAt('1.1.122'), content: { 'cs/operations/get__Info.md': `Volejte ${symbol}/Info.\n` } });
    await assert.rejects(run(other), /content\/cs\/operations\/get__Info\.md.*neznámý zástupný symbol \{\{/, symbol);
  }
});

const NOTICE = { cs: 'Toto je dokumentace testovacího prostředí.', en: 'This is the documentation of the test environment.' };
/** Prostředí, kde TEST má upozornění. */
const withNotice = (notice = NOTICE) => ENVIRONMENTS.map((environment) => (environment.slug === 'test' ? { ...environment, notice } : environment));

test('u prostředí s upozorněním je upozornění hned pod prvním nadpisem úvodu, v jazyce dané verze', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    environments: withNotice(),
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\nK čemu API slouží.\n',
      'cs/intro/20-autentizace.md': '# Autentizace\n\nToken.\n',
      'en/intro/10-introduction.md': '# Introduction\n\nWhat the API is for.\n',
    },
  });

  await run(inputs);

  assert.equal(
    (await readJson(inputs.outDir, 'openapi.test.json')).info.description,
    '# Úvod\n\n> [!WARNING]\n> Toto je dokumentace testovacího prostředí.\n\nK čemu API slouží.\n\n# Autentizace\n\nToken.',
  );
  assert.equal(
    (await readJson(inputs.outDir, 'en', 'openapi.test.json')).info.description,
    '# Introduction\n\n> [!WARNING]\n> This is the documentation of the test environment.\n\nWhat the API is for.',
  );
  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).info.description, '# Úvod\n\nK čemu API slouží.\n\n# Autentizace\n\nToken.');
});

test('úvod začíná nadpisem, takže v menu nevznikne položka navíc; kapitola bez nadpisu na začátku shodí build', async () => {
  const content = { 'cs/intro/10-uvod.md': '# Úvod\n\nText.\n', 'cs/intro/20-autentizace.md': 'Token se posílá v hlavičce.\n\n# Autentizace\n' };
  const inputs = await project({ specs: bothAt('1.1.122'), environments: withNotice(), content });

  await assert.rejects(run(inputs), /content\/cs\/intro\/20-autentizace\.md.*nadpis/);

  const fixed = await project({ specs: bothAt('1.1.122'), environments: withNotice(), content: { ...content, 'cs/intro/20-autentizace.md': '\n# Autentizace\n\nToken.\n' } });
  await run(fixed);
  for (const slug of ['prod', 'test']) {
    assert.match((await readJson(fixed.outDir, `openapi.${slug}.json`)).info.description, /^# Úvod\n/);
  }
});

test('upozornění bez znění pro některý jazyk shodí build', async () => {
  const environments = withNotice({ cs: NOTICE.cs });
  const inputs = await project({ specs: bothAt('1.1.122'), environments, content: { 'en/intro/10-introduction.md': '# Introduction\n' } });

  await assert.rejects(run(inputs), /TEST.*notice.*en/);
});

test('konce řádků ve výsledné specifikaci jsou jednotné, ať přišly z textů, overlay nebo ze zdroje', async () => {
  const paths = { '/Info': { get: operation('Info', { summary: 'Stav služby.\r\nDruhý řádek.' }) } };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths);
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: { 'base.json': { tags: [{ name: 'Info', 'x-displayName': 'Stav\r\nslužby' }] } },
    content: {
      'cs/intro/10-uvod.md': '# Úvod\r\n\r\nText z Windows.\r\n',
      'cs/operations/get__Info.md': 'První řádek.\r\nDruhý řádek.\rTřetí řádek.\r\n',
    },
  });

  await run(inputs);

  for (const file of ['openapi.prod.json', 'en/openapi.test.json']) {
    assert.doesNotMatch(await readFile(join(inputs.outDir, file), 'utf8'), /\r|\\r/, file);
  }
  const prod = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.equal(prod.info.description, '# Úvod\n\nText z Windows.');
  assert.equal(prod.paths['/Info'].get.description, 'První řádek.\nDruhý řádek.\nTřetí řádek.');
  assert.equal(prod.paths['/Info'].get.summary, 'Stav služby.\nDruhý řádek');
  assert.equal(prod.tags[0]['x-displayName'], 'Stav\nslužby');
});

// Odkazy mezi texty: autor píše odkaz na soubor, build ho převede na adresu ve Scalaru.

const catalogSpec = () => sourceSpec('Dropshipping API Gateway service, build: 1.1.122', catalogOperations());

const GUIDE = '# Synchronizace katalogu\n\nPrůvodce.\n\n## Full a Update katalog\n\nRozdíl.\n\n### Rozdílový základ – co to je?\n\nZáklad.\n';

test('odkaz na soubor s textem vede na webu na kapitolu, nadpis, skupinu nebo operaci ve zvoleném prostředí', async () => {
  const inputs = await project({
    specs: { prod: catalogSpec(), test: catalogSpec() },
    content: {
      'cs/intro/10-uvod.md':
        '# Úvod\n\nViz [průvodce](30-synchronizace-katalogu.md), [typy katalogu](./30-synchronizace-katalogu.md#full-a-update-katalog), ' +
        '[založení jobu](../operations/post__products_catalog.md), [stažení](../operations/get__files_{fileName}.md "Stažení souboru"), ' +
        '[kategorie](../operations/get__codelists_ProductCategory.md) a [katalog](../tags/Products.md).\n\n## Přehled operací\n\nTabulka.\n',
      'cs/intro/30-synchronizace-katalogu.md': `${GUIDE}\nZpět na [přehled](10-uvod.md#přehled-operací) nebo [nahoru](#synchronizace-katalogu).\n`,
      'cs/tags/Products.md': 'Postup popisuje [průvodce](../intro/30-synchronizace-katalogu.md).\n',
      'cs/operations/post__products_catalog.md':
        'Stav zjistí [GET](get__products_catalog.md). Pojmy: [rozdílový základ](../intro/30-synchronizace-katalogu.md#rozdílový-základ--co-to-je).\n',
      'cs/operations/get__products_catalog.md': 'Stav jobu.\n',
      'cs/operations/get__files_{fileName}.md': 'Stažení.\n',
      'cs/operations/get__codelists_ProductCategory.md': 'Kategorie.\n',
    },
  });

  await run(inputs);

  const prod = await readJson(inputs.outDir, 'openapi.prod.json');
  assert.equal(
    prod.info.description,
    '# Úvod\n\nViz [průvodce](#prod/description/synchronizace-katalogu), [typy katalogu](#prod/description/full-a-update-katalog), ' +
      '[založení jobu](#prod/tag/products/POST/products/catalog), [stažení](#prod/tag/products/GET/files/{fileName} "Stažení souboru"), ' +
      '[kategorie](#prod/tag/codelist/GET/codelists/ProductCategory) a [katalog](#prod/tag/products).\n\n## Přehled operací\n\nTabulka.\n\n' +
      `${GUIDE}\nZpět na [přehled](#prod/description/přehled-operací) nebo [nahoru](#prod/description/synchronizace-katalogu).`,
  );
  assert.equal(prod.tags.find((tag) => tag.name === 'Products').description, 'Postup popisuje [průvodce](#prod/description/synchronizace-katalogu).');
  assert.equal(
    prod.paths['/products/catalog'].post.description,
    'Stav zjistí [GET](#prod/tag/products/GET/products/catalog). Pojmy: [rozdílový základ](#prod/description/rozdílový-základ-co-to-je).',
  );
  const test = await readJson(inputs.outDir, 'openapi.test.json');
  assert.equal(test.tags.find((tag) => tag.name === 'Products').description, 'Postup popisuje [průvodce](#test/description/synchronizace-katalogu).');
  assert.match(test.paths['/products/catalog'].post.description, /\[GET\]\(#test\/tag\/products\/GET\/products\/catalog\)/);
});

test('odkaz, který nikam nevede, shodí build a hlášení vyjmenuje všechny takové odkazy', async () => {
  const inputs = await project({
    specs: { prod: catalogSpec(), test: catalogSpec() },
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\n[průvodce](30-synchronizace.md), [typy](30-synchronizace-katalogu.md#typy-katalogu), [zadání](../../../ZADANI.md).\n',
      'cs/intro/30-synchronizace-katalogu.md': GUIDE,
      'cs/operations/get__Info.md': 'Viz [stav jobu](get__products_katalog.md) a [chyby](#časté-chyby).\n',
    },
  });

  await assert.rejects(run(inputs), (error) => {
    assert.match(error.message, /content\/cs\/intro\/10-uvod\.md: odkaz 30-synchronizace\.md/);
    assert.match(error.message, /content\/cs\/intro\/10-uvod\.md: odkaz 30-synchronizace-katalogu\.md#typy-katalogu/);
    assert.match(error.message, /content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/\.\.\/\.\.\/ZADANI\.md/);
    assert.match(error.message, /content\/cs\/operations\/get__Info\.md: odkaz get__products_katalog\.md/);
    assert.match(error.message, /content\/cs\/operations\/get__Info\.md: odkaz #časté-chyby/);
    return true;
  });
  await assert.rejects(readFile(join(inputs.outDir, 'openapi.prod.json')), { code: 'ENOENT' });
});

test('odkazy v ukázkách kódu, odkazy na web a na jiné soubory než texty zůstanou beze změny', async () => {
  const text =
    'Web [eD system](https://www.edsystem.cz/kontakt.md), [kolekce](postman.prod.json), [pošta](mailto:podpora@example.cz).\n\n' +
    'Zápis odkazu: `[průvodce](30-neexistuje.md)`.\n\n```markdown\n[průvodce](30-neexistuje.md)\n```';
  const inputs = await project({ specs: bothAt('1.1.122'), content: { 'cs/operations/get__Info.md': `${text}\n` } });

  await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).paths['/Info'].get.description, text);
});

test('odkaz na nadpis v popisu operace nebo v textu skupiny vede na operaci nebo skupinu', async () => {
  const inputs = await project({
    specs: { prod: catalogSpec(), test: catalogSpec() },
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\n[chyby](../operations/get__Info.md#časté-chyby), [pravidla](../tags/Products.md#pravidla).\n',
      'cs/tags/Products.md': 'Text.\n\n## Pravidla\n\nPravidla.\n',
      'cs/operations/get__Info.md': 'Popis.\n\n## Časté chyby\n\nŽádné.\n',
    },
  });

  await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).info.description, '# Úvod\n\n[chyby](#prod/tag/info/GET/Info), [pravidla](#prod/tag/products).');
});

test('odkaz na operaci, která v prostředí není, tam zůstane jako prostý text a jinde vede na operaci', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', twoOperations()),
    },
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\nNově: [produktové indexy](../operations/get__codelists_ProductIndex.md) a [číselníky](../tags/Codelist.md).\n',
      'cs/operations/get__codelists_ProductIndex.md': 'Indexy.\n',
      'cs/tags/Codelist.md': 'Číselníky.\n',
    },
  });

  const { output } = await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).info.description, '# Úvod\n\nNově: produktové indexy a číselníky.');
  assert.equal(
    (await readJson(inputs.outDir, 'openapi.test.json')).info.description,
    '# Úvod\n\nNově: [produktové indexy](#test/tag/codelist/GET/codelists/ProductIndex) a [číselníky](#test/tag/codelist).',
  );
  assert.match(output, /^INFO cs PROD: content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/operations\/get__codelists_ProductIndex\.md.*bez odkazu/m);
});

test('odkaz na soubor operace nebo skupiny, která text ještě nemá, vede na operaci nebo skupinu', async () => {
  const inputs = await project({
    specs: { prod: catalogSpec(), test: catalogSpec() },
    content: {
      'cs/intro/10-uvod.md':
        '# Úvod\n\n[založení jobu](../operations/post__products_catalog.md), [kategorie](../operations/get__codelists_ProductCategory.md) a [katalog](../tags/Products.md).\n',
    },
  });

  const { output } = await run(inputs);

  assert.equal(
    (await readJson(inputs.outDir, 'openapi.prod.json')).info.description,
    '# Úvod\n\n[založení jobu](#prod/tag/products/POST/products/catalog), [kategorie](#prod/tag/codelist/GET/codelists/ProductCategory) a [katalog](#prod/tag/products).',
  );
  assert.match((await readJson(inputs.outDir, 'openapi.test.json')).info.description, /\[katalog\]\(#test\/tag\/products\)/);
  assert.match(output, /^WARN cs PROD: operace bez textu:\n(.*\n)*? {4}POST \/products\/catalog$/m);
});

test('odkaz na operaci bez textu, která je jen v jednom prostředí, zůstane jinde jako prostý text', async () => {
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122'),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', twoOperations()),
    },
    content: { 'cs/intro/10-uvod.md': '# Úvod\n\nNově: [produktové indexy](../operations/get__codelists_ProductIndex.md).\n' },
  });

  const { output } = await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).info.description, '# Úvod\n\nNově: produktové indexy.');
  assert.equal(
    (await readJson(inputs.outDir, 'openapi.test.json')).info.description,
    '# Úvod\n\nNově: [produktové indexy](#test/tag/codelist/GET/codelists/ProductIndex).',
  );
  assert.match(output, /^INFO cs PROD: content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/operations\/get__codelists_ProductIndex\.md.*bez odkazu/m);
});

test('odkaz na soubor operace, která neexistuje, shodí build; u jiné velikosti písmen hlášení poradí správný název', async () => {
  const inputs = await project({
    specs: { prod: catalogSpec(), test: catalogSpec() },
    content: {
      'cs/intro/10-uvod.md':
        '# Úvod\n\n[zrušení](../operations/delete__products_catalog.md), [kategorie](../operations/get__codelists_productcategory.md), [objednávky](../tags/Orders.md).\n',
    },
  });

  await assert.rejects(run(inputs), (error) => {
    assert.match(error.message, /content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/operations\/delete__products_catalog\.md/);
    assert.match(error.message, /odkaz \.\.\/operations\/get__codelists_productcategory\.md.*get__codelists_ProductCategory\.md/);
    assert.match(error.message, /content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/tags\/Orders\.md/);
    return true;
  });
});

test('odkaz na nadpis v popisu operace, který ještě není napsaný, shodí build', async () => {
  const inputs = await project({
    specs: { prod: catalogSpec(), test: catalogSpec() },
    content: { 'cs/intro/10-uvod.md': '# Úvod\n\n[chyby](../operations/post__products_catalog.md#časté-chyby).\n' },
  });

  await assert.rejects(run(inputs), /content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/operations\/post__products_catalog\.md#časté-chyby.*text zatím nemá/);
});

test('stejný nadpis ve dvou kapitolách dostane adresu s pořadím, jak ji přiděluje Scalar', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\n## Příklad\n\nPrvní. Viz [druhý příklad](20-autentizace.md#příklad) a [třetí](20-autentizace.md#příklad-1).\n',
      'cs/intro/20-autentizace.md': '# Autentizace\n\n## Příklad\n\nDruhý.\n\n## Příklad\n\nTřetí. Viz [první příklad](10-uvod.md#příklad).\n',
    },
  });

  await run(inputs);

  const { description } = (await readJson(inputs.outDir, 'openapi.prod.json')).info;
  assert.match(description, /\[druhý příklad\]\(#prod\/description\/příklad-1\)/);
  assert.match(description, /\[třetí\]\(#prod\/description\/příklad-2\)/);
  assert.match(description, /\[první příklad\]\(#prod\/description\/příklad\)/);
});

test('odkaz na text zapsaný definicí pod čarou shodí build, protože ho build nepřevádí', async () => {
  const content = { 'cs/operations/get__Info.md': 'Stav služby.\n' };
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: { ...content, 'cs/intro/10-uvod.md': '# Úvod\n\nViz [stav služby][info].\n\n[info]: ../operations/get__Info.md\n' },
  });

  await assert.rejects(run(inputs), /content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/operations\/get__Info\.md.*\[text\]\(soubor\.md\)/);

  const web = await project({
    specs: bothAt('1.1.122'),
    content: { ...content, 'cs/intro/10-uvod.md': '# Úvod\n\nViz [web][ed].\n\n[ed]: https://www.edsystem.cz\n' },
  });
  await run(web);
});

test('nadpis úvodní kapitoly s formátováním shodí build, protože Scalar by k položce menu nedoskočil', async () => {
  for (const heading of ['## Element `Canceled`', '## Získání client_id a client_secret', '### Máme **tučné**?', '## [Odkaz](10-uvod.md)', '## Ceny &amp; poplatky']) {
    const inputs = await project({ specs: bothAt('1.1.122'), content: { 'cs/intro/10-uvod.md': `# Úvod\n\n${heading}\n\nText.\n` } });
    await assert.rejects(run(inputs), /content\/cs\/intro\/10-uvod\.md.*nadpis.*prostý text/s, heading);
  }
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: {
      'cs/intro/10-uvod.md':
        '# Úvod\n\n## GET /files/{fileName} – stažení (ZIP), 1. část?\n\n## Parametr access_token & další\n\n```bash\n# komentář s `kódem`\n```\n',
    },
  });
  await run(inputs);
});

test('nadpis úvodní kapitoly zapsaný podtržením shodí build, protože by rozhodil číslování adres nadpisů', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), content: { 'cs/intro/10-uvod.md': '# Úvod\n\nPříklad\n---\n\nText.\n' } });
  await assert.rejects(run(inputs), /content\/cs\/intro\/10-uvod\.md.*„Příklad“.*podtržením/);

  const table = '# Úvod\n\nText.\n\n---\n\n| Účel | Operace |\n| --- | --- |\n| a | b |\n\n```text\nPříklad\n---\n```\n';
  await run(await project({ specs: bothAt('1.1.122'), content: { 'cs/intro/10-uvod.md': table } }));
});

// Pokrytí: výpis na konci buildu je seznam zbývající práce.

test('build na konci vypíše pokrytí pro každý jazyk a prostředí a operace bez textu podle skupin', async () => {
  const inputs = await project({
    specs: {
      prod: catalogSpec(),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', { ...catalogOperations(), '/codelists/ProductIndex': { get: operation('Codelist') } }),
    },
    overlays: { 'base.json': { tags: [{ name: 'Info' }, { name: 'Codelist' }, { name: 'Products' }] } },
    content: {
      'cs/tags/Products.md': 'Katalog.\n',
      'cs/operations/post__products_catalog.md': 'Založení jobu.\n',
      'cs/operations/get__codelists_ProductIndex.md': 'Indexy.\n',
      'en/operations/get__Info.md': 'Service status.\n',
    },
  });

  const { output } = await run(inputs);

  const coverage = output.slice(output.indexOf('INFO Web sestaven'));
  assert.equal(
    coverage.slice(coverage.indexOf('\n') + 1),
    [
      'INFO cs PROD: popsáno 1 z 5 operací a 1 z 3 skupin',
      'WARN cs PROD: skupiny bez textu: Info, Codelist',
      'WARN cs PROD: operace bez textu:',
      '  Info',
      '    GET /Info',
      '  Codelist',
      '    GET /codelists/ProductCategory',
      '  Products',
      '    GET /products/catalog',
      '    GET /files/{fileName}',
      'INFO cs TEST: popsáno 2 z 6 operací a 1 z 3 skupin',
      'WARN cs TEST: skupiny bez textu: Info, Codelist',
      'WARN cs TEST: operace bez textu:',
      '  Info',
      '    GET /Info',
      '  Codelist',
      '    GET /codelists/ProductCategory',
      '  Products',
      '    GET /products/catalog',
      '    GET /files/{fileName}',
      'INFO en PROD: popsáno 1 z 5 operací a 0 z 3 skupin',
      'WARN en PROD: skupiny bez textu: Info, Codelist, Products',
      'WARN en PROD: operace bez textu:',
      '  Codelist',
      '    GET /codelists/ProductCategory',
      '  Products',
      '    GET /products/catalog',
      '    POST /products/catalog',
      '    GET /files/{fileName}',
      'INFO en TEST: popsáno 1 z 6 operací a 0 z 3 skupin',
      'WARN en TEST: skupiny bez textu: Info, Codelist, Products',
      'WARN en TEST: operace bez textu:',
      '  Codelist',
      '    GET /codelists/ProductCategory',
      '    GET /codelists/ProductIndex',
      '  Products',
      '    GET /products/catalog',
      '    POST /products/catalog',
      '    GET /files/{fileName}',
    ].join('\n'),
  );
});

test('jazyková verze, kde mají text všechny operace i skupiny, je ve výpisu pokrytí bez varování', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    content: { 'cs/tags/Info.md': 'Stav služby.\n', 'cs/operations/get__Info.md': 'Stav služby.\n' },
  });

  const { output } = await run(inputs);

  assert.match(output, /^INFO cs PROD: popsáno 1 z 1 operací a 1 z 1 skupin$/m);
  assert.doesNotMatch(output, /WARN cs/);
  assert.match(output, /^WARN en TEST: operace bez textu:\n {2}Info\n {4}GET \/Info$/m);
});

test('operace, jejichž cesty se liší jen lomítkem a podtržítkem, se počítají obě; popis ani odkaz se stejným názvem souboru přiřadit nejde a shodí build', async () => {
  const paths = { '/a/b': { get: operation('Info') }, '/a_b': { get: operation('Info') } };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths);
  const withoutText = await project({ specs: { prod: spec, test: spec } });

  const { output } = await run(withoutText);

  assert.match(output, /^INFO cs PROD: popsáno 0 z 2 operací a 0 z 1 skupin$/m);
  assert.match(output, /^WARN cs PROD: operace bez textu:\n {2}Info\n {4}GET \/a\/b\n {4}GET \/a_b$/m);

  const withText = await project({ specs: { prod: spec, test: spec }, content: { 'cs/operations/get__a_b.md': 'Popis.\n' } });
  await assert.rejects(run(withText), /content\/cs\/operations\/get__a_b\.md.*GET \/a\/b.*GET \/a_b/);

  const withLink = await project({ specs: { prod: spec, test: spec }, content: { 'cs/intro/10-uvod.md': '# Úvod\n\n[operace](../operations/get__a_b.md)\n' } });
  await assert.rejects(run(withLink), /content\/cs\/intro\/10-uvod\.md: odkaz \.\.\/operations\/get__a_b\.md.*GET \/a\/b.*GET \/a_b/);
});

test('skupina, která je u operace uvedená až jako druhá, se do pokrytí počítá také', async () => {
  const paths = { '/Info': { get: operation('Info') }, '/Status': { get: { ...operation('Info'), tags: ['Info', 'Monitoring'] } } };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths);
  const inputs = await project({ specs: { prod: spec, test: spec }, content: { 'cs/tags/Monitoring.md': 'Sledování.\n' } });

  const { output } = await run(inputs);

  assert.match(output, /^INFO cs PROD: popsáno 0 z 2 operací a 1 z 2 skupin$/m);
  assert.match(output, /^WARN cs PROD: skupiny bez textu: Info$/m);
  assert.match(output, /^WARN en PROD: skupiny bez textu: Info, Monitoring$/m);
  assert.match(output, /^WARN cs PROD: operace bez textu:\n {2}Info\n {4}GET \/Info\n {4}GET \/Status$/m);
});

test('prázdný soubor s textem shodí build, aby se nepočítal jako popis', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), content: { 'cs/operations/get__Info.md': '\n \n', 'cs/tags/Info.md': 'Stav služby.\n' } });

  await assert.rejects(run(inputs), /content\/cs\/operations\/get__Info\.md.*prázdný/);
});

// Anglická verze: řetězce ze specifikace se překládají podle znění (i18n/en.json).

test('anglická verze má řetězce ze specifikace i z overlay přeložené podle znění, česká je má beze změny', async () => {
  const paths = {
    '/Info': { get: operation('Info') },
    '/codelists/countries': {
      get: operation('Codelist', {
        summary: 'Vraci ciselnik zemi.',
        parameters: [{ name: 'lang', in: 'query', description: 'Jazyk\r\nnázvů.', schema: { type: 'string' } }],
        responses: { 200: { description: 'Success' } },
      }),
    },
  };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths, {
    schemas: { 'Elinkx.Models.CountryModel': { type: 'object', description: 'Země.', properties: { name: { type: 'string', description: 'Název země.' } } } },
  });
  const inputs = await project({
    specs: { prod: spec, test: spec },
    overlays: {
      'base.json': {
        tags: [{ name: 'Info', 'x-displayName': 'Stav služby' }, { name: 'Codelist', 'x-displayName': 'Číselníky' }],
        paths: { '/codelists/countries': { get: { summary: 'Číselník zemí.' } } },
      },
    },
    translations: {
      'Číselník zemí.': 'Country codelist.',
      'Jazyk\nnázvů.': 'Language\nof names.',
      Success: 'Success',
      'Země.': 'Country.',
      'Název země.': 'Country name.',
      'Stav služby': 'Service status',
      'Číselníky': 'Codelists',
    },
  });

  await run(inputs);

  for (const slug of ['prod', 'test']) {
    const en = await readJson(inputs.outDir, 'en', `openapi.${slug}.json`);
    const countries = en.paths['/codelists/countries'].get;
    assert.equal(countries.summary, 'Country codelist');
    assert.equal(countries.parameters[0].description, 'Language\nof names.');
    assert.equal(countries.responses[200].description, 'Success');
    assert.equal(en.components.schemas.CountryModel.description, 'Country.');
    assert.equal(en.components.schemas.CountryModel.properties.name.description, 'Country name.');
    assert.deepEqual(en.tags, [{ name: 'Info', 'x-displayName': 'Service status' }, { name: 'Codelist', 'x-displayName': 'Codelists' }]);
    const cs = await readJson(inputs.outDir, `openapi.${slug}.json`);
    assert.equal(cs.paths['/codelists/countries'].get.summary, 'Číselník zemí');
    assert.deepEqual(cs.tags, [{ name: 'Info', 'x-displayName': 'Stav služby' }, { name: 'Codelist', 'x-displayName': 'Číselníky' }]);
  }
});

test('nový nebo změněný řetězec zůstane česky a build ho vypíše jako nepřeložený s místem výskytu, nespadne', async () => {
  const withSummary = (summary) => ({ '/Info': { get: operation('Info', { summary }) } });
  const inputs = await project({
    specs: {
      prod: sourceSpec('Dropshipping API Gateway service, build: 1.1.122', withSummary('Vrátí stav služby.')),
      test: sourceSpec('Dropshipping API Gateway service, build: 1.1.123', withSummary('Vrátí stav a verzi služby.')),
    },
    translations: { 'Vrátí stav služby.': 'Returns the service status.', Success: 'Success', 'Starý řetězec.': 'Old string.' },
  });

  const { output } = await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'en', 'openapi.prod.json')).paths['/Info'].get.summary, 'Returns the service status');
  assert.equal((await readJson(inputs.outDir, 'en', 'openapi.test.json')).paths['/Info'].get.summary, 'Vrátí stav a verzi služby');
  assert.match(
    output,
    /^WARN en: nepřeložené řetězce ze specifikace \(1\), zůstaly česky; doplňte je do i18n\/en\.json:\n {2}"Vrátí stav a verzi služby\."  \(paths › \/Info › get › summary, jen TEST\)$/m,
  );
  assert.match(output, /^INFO en: překlady v i18n\/en\.json, které ve specifikaci nic nepřekládají:\n {2}"Starý řetězec\."$/m);
  assert.doesNotMatch(output, /WARN cs.*nepřeložen/);
});

test('překlad se zástupným symbolem sedí na řetězec z overlay v každém prostředí', async () => {
  const inputs = await project({
    specs: bothAt('1.1.122'),
    overlays: { 'base.json': { paths: { '/Info': { get: { summary: 'Token vydává {{tokenUrl}}.' } } } } },
    translations: { 'Token vydává {{tokenUrl}}.': 'The token is issued by {{tokenUrl}}.', Success: 'Success' },
  });

  const { output } = await run(inputs);

  assert.equal((await readJson(inputs.outDir, 'en', 'openapi.prod.json')).paths['/Info'].get.summary, 'The token is issued by https://auth.example.cz/oauth/token');
  assert.equal((await readJson(inputs.outDir, 'en', 'openapi.test.json')).paths['/Info'].get.summary, 'The token is issued by https://auth-test.example.cz/oauth/token');
  assert.doesNotMatch(output, /nepřeložen|nic nepřekládají/);
});

test('příklady, výchozí hodnoty a výčty jsou data API: nepřekládají se ani nehlásí; název příkladu a vlastnost pojmenovaná default se překládají', async () => {
  const schema = {
    type: 'object',
    description: 'Produkt.',
    properties: {
      default: { type: 'boolean', description: 'Výchozí.' },
      state: { type: 'string', enum: ['Skladem'], default: 'Skladem', example: 'Skladem' },
    },
    example: { description: 'Notebook s klávesnicí.' },
  };
  const examples = { notebook: { summary: 'Notebook.', value: { description: 'Notebook s klávesnicí.' } } };
  const paths = {
    '/Info': { get: operation('Info', { responses: { 200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' }, examples } } } } }) },
  };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths, { schemas: { Product: schema } });
  const inputs = await project({
    specs: { prod: spec, test: spec },
    translations: { Success: 'Success', 'Produkt.': 'Product.', 'Výchozí.': 'Default.', 'Notebook.': 'Laptop.' },
  });

  const { output } = await run(inputs);

  const en = await readJson(inputs.outDir, 'en', 'openapi.prod.json');
  assert.deepEqual(en.paths['/Info'].get.responses[200].content['application/json'].examples, {
    notebook: { summary: 'Laptop.', value: { description: 'Notebook s klávesnicí.' } },
  });
  const product = en.components.schemas.Product;
  assert.equal(product.properties.default.description, 'Default.');
  assert.deepEqual(product.example, { description: 'Notebook s klávesnicí.' });
  assert.deepEqual(product.properties.state, schema.properties.state);
  assert.doesNotMatch(output, /nepřeložen/);
});

test('slovník s prázdným překladem nebo neplatným JSON shodí build s názvem souboru', async () => {
  await assert.rejects(run(await project({ specs: bothAt('1.1.122'), translations: { Success: '' } })), /i18n\/en\.json: překlad musí být neprázdný řetězec:\n {2}"Success"/);
  await assert.rejects(run(await project({ specs: bothAt('1.1.122'), translations: '{ "Success": ' })), /i18n\/en\.json: /);
});

test('text bez protějšku v druhém jazyce build vypíše jako varování; v druhém jazyce se nezobrazí a jiným jazykem se nedoplní', async () => {
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', catalogOperations());
  const inputs = await project({
    specs: { prod: spec, test: spec },
    content: {
      'cs/intro/10-uvod.md': '# Úvod\n\nK čemu API slouží.\n',
      'en/intro/10-uvod.md': '# Introduction\n\nWhat the API is for.\n',
      'cs/intro/20-autentizace.md': '# Autentizace\n\nToken.\n',
      'cs/operations/post__products_catalog.md': 'Založení jobu.\n',
      'en/tags/Products.md': 'Product catalog.\n',
      'cs/_sablona-operace.md': '# Šablona\n',
    },
    translations: { Success: 'Success' },
  });

  const { output } = await run(inputs);

  assert.match(
    output,
    /^WARN Texty bez protějšku v druhém jazyce \(3\); v druhém jazyce se nezobrazí:\n {2}content\/cs\/intro\/20-autentizace\.md: chybí content\/en\/intro\/20-autentizace\.md\n {2}content\/cs\/operations\/post__products_catalog\.md: chybí content\/en\/operations\/post__products_catalog\.md\n {2}content\/en\/tags\/Products\.md: chybí content\/cs\/tags\/Products\.md$/m,
  );
  for (const slug of ['prod', 'test']) {
    const en = await readJson(inputs.outDir, 'en', `openapi.${slug}.json`);
    assert.equal(en.info.description.startsWith('# Introduction\n\nWhat the API is for.'), true);
    assert.doesNotMatch(en.info.description, /Autentizace/);
    assert.equal(en.paths['/products/catalog'].post.description, undefined);
    const cs = await readJson(inputs.outDir, `openapi.${slug}.json`);
    assert.equal(cs.tags?.find(({ name }) => name === 'Products')?.description, undefined);
  }
});

// Rozhraní Scalaru: česká verze dostane překlady z i18n/scalar.cs.json.

const localizationOf = async (...path) =>
  JSON.parse(/localize\((.*?)\)<\/script>/s.exec(await readFile(join(...path, 'index.html'), 'utf8'))[1]);

test('česká stránka předá Scalaru český překlad rozhraní, anglická jeho vestavěnou angličtinu', async () => {
  const scalarTranslations = { search: { open: 'Otevřít vyhledávání', placeholder: 'Hledat </script>…' } };
  const inputs = await project({ specs: bothAt('1.1.122'), template: '<html><script>localize({{localization}})</script></html>', scalarTranslations });

  await run(inputs);

  assert.deepEqual(await localizationOf(inputs.outDir), { locale: 'cs', translations: scalarTranslations });
  assert.deepEqual(await localizationOf(inputs.outDir, 'en'), { locale: 'en' });
  assert.doesNotMatch(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), /<\/script>…/);
});

// Přepínač jazyka v záhlaví.

test('přepínač jazyka ukazuje CZ a EN, zvolený jazyk jako aktuální a druhý jako relativní odkaz na jeho verzi', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), template: '<header>{{languageSwitch}}</header>' });

  await run(inputs);

  // Adresu verze nese i data-language-switch: skript k ní doplní místo v referenci.
  assert.equal(
    await readFile(join(inputs.outDir, 'index.html'), 'utf8'),
    '<header><nav class="site-languages" aria-label="Jazyk"><span lang="cs" aria-current="true">CZ</span><a href="en/" hreflang="en" lang="en" data-language-switch="en/">EN</a></nav></header>',
  );
  assert.equal(
    await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'),
    '<header><nav class="site-languages" aria-label="Language"><a href="../" hreflang="cs" lang="cs" data-language-switch="../">CZ</a><span lang="en" aria-current="true">EN</span></nav></header>',
  );
});

test('tlačítko barevného režimu má popisek v jazyce verze', async () => {
  const inputs = await project({ specs: bothAt('1.1.122'), template: '<button aria-label="{{themeLabel}}"></button>' });

  await run(inputs);

  assert.equal(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), '<button aria-label="Tmavý režim"></button>');
  assert.equal(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), '<button aria-label="Dark mode"></button>');
});

test('název operace nemá na konci tečku v žádném jazyce, výpustka a tečka uvnitř zůstanou', async () => {
  const paths = {
    '/Info': { get: operation('Info', { summary: 'Vrátí stav služby.' }) },
    '/codelists/countries': { get: operation('Codelist', { summary: 'Číselník zemí, např. CZ…' }), post: operation('Codelist', { summary: 'Import 1.2 dat...' }) },
  };
  const spec = sourceSpec('Dropshipping API Gateway service, build: 1.1.122', paths, {
    schemas: { Country: { type: 'object', description: 'Země.' } },
  });
  const inputs = await project({
    specs: { prod: spec, test: spec },
    translations: { 'Vrátí stav služby.': 'Returns the service status.', 'Země.': 'Country.' },
  });

  await run(inputs);

  for (const [dir, info, schema] of [['', 'Vrátí stav služby', 'Země.'], ['en', 'Returns the service status', 'Country.']]) {
    const built = await readJson(inputs.outDir, dir, 'openapi.prod.json');
    assert.equal(built.paths['/Info'].get.summary, info);
    assert.equal(built.paths['/codelists/countries'].get.summary, 'Číselník zemí, např. CZ…');
    assert.equal(built.paths['/codelists/countries'].post.summary, 'Import 1.2 dat...');
    assert.equal(built.components.schemas.Country.description, schema);
  }
});

test('česká stránka dostane překlad textů, které má Scalar napevno anglicky; anglická žádný', async () => {
  const scalarFixedTexts = { Copy: 'Kopírovat', 'Copy {name} code': 'Kopírovat kód {name}' };
  const inputs = await project({ specs: bothAt('1.1.122'), template: '<script>fixed({{fixedTexts}})</script>', scalarFixedTexts });

  await run(inputs);

  assert.equal(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), `<script>fixed(${JSON.stringify(scalarFixedTexts)})</script>`);
  assert.equal(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), '<script>fixed(null)</script>');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** Založí zdrojové složky s daným obsahem a vrátí vstupy pro build. */
async function project({ specs, overlays = {}, template = TEMPLATE, assets = {} }) {
  const dir = await mkdtemp(join(tmpdir(), 'build-'));
  const specDir = join(dir, 'spec');
  const overlayDir = join(dir, 'overlay');
  const siteDir = join(dir, 'site');
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
  const assetList = [];
  for (const [to, content] of Object.entries(assets)) {
    const from = join(dir, `asset-${assetList.length}`);
    await writeFile(from, content);
    assetList.push({ from, to });
  }
  return { environments: ENVIRONMENTS, specDir, overlayDir, siteDir, outDir: join(dir, 'dist'), assets: assetList };
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
    '/codelists/ProductCategory': { get: operation('Codelist', { summary: 'Číselník kategorií.' }) },
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
      summary: 'Číselník produktových indexů.',
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

  assert.equal((await readJson(inputs.outDir, 'openapi.prod.json')).paths['/codelists/ProductIndex'].get.summary, 'Ze souboru products.');
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
  assert.equal((await readJson(inputs.outDir, 'openapi.test.json')).paths['/codelists/ProductIndex'].get.summary, 'Číselník produktových indexů.');
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
  summary: 'Stažení katalogového souboru.',
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const ENVIRONMENTS = [
  { slug: 'prod', title: 'Dropshipping API - PROD', default: true },
  { slug: 'test', title: 'Dropshipping API - TEST', default: false },
];

const sourceSpec = (title, paths = { '/Info': { get: { tags: ['Info'] } } }) => ({
  openapi: '3.0.1',
  info: { title, version: 'v1' },
  paths,
});

const TEMPLATE = '<html lang="{{lang}}"><title>{{pageTitle}}</title><script src="{{rootPath}}assets/app.js"></script><script>start({{sources}})</script></html>';

/** Založí zdrojové složky s daným obsahem a vrátí vstupy pro build. */
async function project({ specs, template = TEMPLATE, assets = {} }) {
  const dir = await mkdtemp(join(tmpdir(), 'build-'));
  const specDir = join(dir, 'spec');
  const siteDir = join(dir, 'site');
  await mkdir(specDir);
  await mkdir(siteDir);
  for (const [slug, spec] of Object.entries(specs)) {
    await writeFile(join(specDir, `swagger.${slug}.source.json`), JSON.stringify(spec));
  }
  await writeFile(join(siteDir, 'index.html'), template);
  const assetList = [];
  for (const [to, content] of Object.entries(assets)) {
    const from = join(dir, `asset-${assetList.length}`);
    await writeFile(from, content);
    assetList.push({ from, to });
  }
  return { environments: ENVIRONMENTS, specDir, siteDir, outDir: join(dir, 'dist'), assets: assetList };
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
    '/Info': { get: { tags: ['Info'] } },
    '/codelists/ProductCategory': { get: { tags: ['Codelist'], summary: 'Číselník kategorií.' } },
    '/b2b/orders': { get: { tags: ['OrdersB2B'] }, post: { tags: ['OrdersB2B'] } },
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

  assert.match(await readFile(join(inputs.outDir, 'index.html'), 'utf8'), /<title>Dokumentace Dropshipping API<\/title>/);
  assert.match(await readFile(join(inputs.outDir, 'en', 'index.html'), 'utf8'), /<title>Dropshipping API documentation<\/title>/);
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
  const paths = { '/Info': { get: {} }, '/b2b/orders': { get: {}, post: {}, parameters: [] } };
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

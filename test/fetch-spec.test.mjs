import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitMessage, fetchSpecs } from '../scripts/fetch-spec.mjs';

const ENVIRONMENTS = [
  { slug: 'prod', title: 'Dropshipping API - PROD', specUrl: 'https://api.example/swagger.json' },
  { slug: 'test', title: 'Dropshipping API - TEST', specUrl: 'https://api-test.example/swagger.json' },
];

// Záměrně s \r\n a nezvyklým odsazením: uložit se má přesně to, co API vrátilo.
const specBody = (build) =>
  `{"openapi":"3.0.1",\r\n  "info":{"title":"Dropshipping API Gateway service, build: ${build}","version":"v1"},"paths":{"/Info":{"get":{}}}}`;

const respond = (body, status = 200) => async () => new Response(body, { status });

/** Falešné API: pro každou adresu vrací, co určí `routes`. */
const fakeFetch = (routes) => async (url) => {
  const route = routes[url];
  if (!route) throw new Error(`neočekávaná adresa ${url}`);
  return route();
};

async function run(routes, specDir) {
  const lines = [];
  const log = { info: (m) => lines.push(`INFO ${m}`), warn: (m) => lines.push(`WARN ${m}`) };
  const results = await fetchSpecs({ environments: ENVIRONMENTS, specDir, fetchImpl: fakeFetch(routes), log });
  return { results, output: lines.join('\n') };
}

const bothAt = (build) => ({
  'https://api.example/swagger.json': respond(specBody(build)),
  'https://api-test.example/swagger.json': respond(specBody(build)),
});

const specPath = (dir, slug) => join(dir, `swagger.${slug}.source.json`);
const newDir = () => mkdtemp(join(tmpdir(), 'fetch-spec-'));

test('první stažení uloží specifikace obou prostředí přesně tak, jak je API vrátilo', async () => {
  const dir = await newDir();
  await run(bothAt('1.1.122'), dir);
  assert.equal(await readFile(specPath(dir, 'prod'), 'utf8'), specBody('1.1.122'));
  assert.equal(await readFile(specPath(dir, 'test'), 'utf8'), specBody('1.1.122'));
});

test('druhé spuštění beze změny ohlásí, že se nic nezměnilo, a soubory nepřepíše', async () => {
  const dir = await newDir();
  await run(bothAt('1.1.122'), dir);
  const old = new Date('2020-01-01T00:00:00Z');
  await utimes(specPath(dir, 'prod'), old, old);

  const { results, output } = await run(bothAt('1.1.122'), dir);

  assert.deepEqual(results.map((r) => r.status), ['unchanged', 'unchanged']);
  assert.match(output, /INFO PROD: beze změny/);
  assert.match(output, /INFO TEST: beze změny/);
  assert.equal((await stat(specPath(dir, 'prod'))).mtimeMs, old.getTime());
});

test('změna jednoho prostředí přepíše jen jeho soubor a vypíše prostředí a číslo buildu z titulku', async () => {
  const dir = await newDir();
  await run(bothAt('1.1.122'), dir);

  const { results, output } = await run(
    { ...bothAt('1.1.122'), 'https://api-test.example/swagger.json': respond(specBody('1.1.123')) },
    dir,
  );

  assert.deepEqual(results, [
    { slug: 'prod', status: 'unchanged' },
    { slug: 'test', status: 'changed', build: '1.1.123' },
  ]);
  assert.match(output, /INFO TEST: nová specifikace, build 1\.1\.123/);
  assert.equal(await readFile(specPath(dir, 'test'), 'utf8'), specBody('1.1.123'));
  assert.equal(await readFile(specPath(dir, 'prod'), 'utf8'), specBody('1.1.122'));
});

test('změněná specifikace bez čísla buildu v titulku se uloží s varováním', async () => {
  const dir = await newDir();
  const body = '{"openapi":"3.0.1","info":{"title":"Dropshipping API Gateway service","version":"v1"},"paths":{}}';

  const { results, output } = await run(
    { ...bothAt('1.1.122'), 'https://api.example/swagger.json': respond(body) },
    dir,
  );

  assert.deepEqual(results[0], { slug: 'prod', status: 'changed', build: null });
  assert.match(output, /WARN PROD: .*číslo buildu/);
  assert.equal(await readFile(specPath(dir, 'prod'), 'utf8'), body);
});

const outages = {
  'síťová chyba': async () => {
    throw new TypeError('fetch failed');
  },
  'odpověď HTTP 503': respond('Service Unavailable', 503),
};

for (const [label, route] of Object.entries(outages)) {
  test(`výpadek API (${label}) uloženou kopii nepřepíše, vypíše varování a nespadne`, async () => {
    const dir = await newDir();
    await run(bothAt('1.1.122'), dir);

    const { results, output } = await run(
      { 'https://api.example/swagger.json': route, 'https://api-test.example/swagger.json': respond(specBody('1.1.123')) },
      dir,
    );

    assert.equal(results[0].status, 'failed');
    assert.match(output, /WARN PROD: stažení selhalo/);
    assert.equal(await readFile(specPath(dir, 'prod'), 'utf8'), specBody('1.1.122'));
    // Výpadek jednoho prostředí nesmí zastavit stažení druhého.
    assert.equal(results[1].status, 'changed');
  });
}

const invalidResponses = {
  'HTML stránka místo JSON': '<html><body>Bad Gateway</body></html>',
  'prázdná odpověď': '',
  'JSON, který není objekt': '[]',
  'JSON bez verze OpenAPI': '{"info":{"title":"x, build: 9.9.9"},"paths":{}}',
  'Swagger 2.0': '{"swagger":"2.0","info":{"title":"x, build: 9.9.9"},"paths":{}}',
  'specifikace bez cest': '{"openapi":"3.0.1","info":{"title":"x, build: 9.9.9"}}',
  'specifikace bez info': '{"openapi":"3.0.1","paths":{}}',
};

for (const [label, body] of Object.entries(invalidResponses)) {
  test(`odpověď, která není specifikace OpenAPI (${label}), se neuloží a skript nespadne`, async () => {
    const dir = await newDir();
    await run(bothAt('1.1.122'), dir);

    const { results, output } = await run(
      { ...bothAt('1.1.122'), 'https://api.example/swagger.json': respond(body) },
      dir,
    );

    assert.equal(results[0].status, 'failed');
    assert.match(output, /WARN PROD: stažení selhalo/);
    assert.equal(await readFile(specPath(dir, 'prod'), 'utf8'), specBody('1.1.122'));
  });
}

test('neplatná odpověď při prvním stažení žádný soubor nevytvoří', async () => {
  const dir = await newDir();
  await run({ ...bothAt('1.1.122'), 'https://api.example/swagger.json': respond('[]') }, dir);
  await assert.rejects(stat(specPath(dir, 'prod')), { code: 'ENOENT' });
});

test('zpráva commitu jmenuje změněné prostředí a nové číslo buildu', () => {
  const results = [
    { slug: 'prod', status: 'unchanged' },
    { slug: 'test', status: 'changed', build: '1.1.123' },
  ];
  assert.equal(commitMessage(results), 'chore(spec): aktualizace specifikace TEST na build 1.1.123');
});

test('když se nezměnila žádná specifikace, zpráva commitu není', () => {
  const results = [
    { slug: 'prod', status: 'unchanged' },
    { slug: 'test', status: 'failed' },
  ];
  assert.equal(commitMessage(results), null);
});

test('zpráva commitu při změně obou prostředí na stejný build jmenuje obě a build jednou', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: '1.1.123' },
    { slug: 'test', status: 'changed', build: '1.1.123' },
  ];
  assert.equal(commitMessage(results), 'chore(spec): aktualizace specifikace PROD a TEST na build 1.1.123');
});

test('zpráva commitu při změně prostředí na různé buildy uvede build u každého prostředí', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: '1.1.123' },
    { slug: 'test', status: 'changed', build: '1.1.124' },
  ];
  assert.equal(commitMessage(results), 'chore(spec): aktualizace specifikace PROD na build 1.1.123 a TEST na build 1.1.124');
});

test('zpráva commitu u specifikace bez čísla buildu jmenuje jen prostředí', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: null },
    { slug: 'test', status: 'unchanged' },
  ];
  assert.equal(commitMessage(results), 'chore(spec): aktualizace specifikace PROD');
});

test('zpráva commitu uvede prostředí bez čísla buildu až za prostředími s buildem', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: null },
    { slug: 'test', status: 'changed', build: '1.1.124' },
  ];
  // „PROD a TEST na build 1.1.124“ by se četlo, jako by nový build měla obě prostředí.
  assert.equal(commitMessage(results), 'chore(spec): aktualizace specifikace TEST na build 1.1.124 a PROD');
});

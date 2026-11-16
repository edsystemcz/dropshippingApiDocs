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

  assert.partialDeepStrictEqual(results, [
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

  // První stažení: není s čím porovnat, takže předchozí build ani přehled změn nejsou.
  assert.deepEqual(results[0], { slug: 'prod', status: 'changed', build: null, previousBuild: null, changes: null });
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

/** Specifikace s danými operacemi (`GET` na každé cestě, hodnota je název operace) a schématy. */
const specWith = ({ build, paths, schemas }) =>
  JSON.stringify({
    openapi: '3.0.1',
    info: { title: `Dropshipping API Gateway service, build: ${build}`, version: 'v1' },
    paths: Object.fromEntries(Object.entries(paths).map(([path, summary]) => [path, { get: { summary } }])),
    components: { schemas: Object.fromEntries(Object.entries(schemas).map(([name, description]) => [name, { type: 'object', description }])) },
  });

test('změna ohlásí předchozí číslo buildu a které operace a schémata přibyly, zmizely nebo se změnily', async () => {
  const dir = await newDir();
  const before = specWith({ build: '1.1.122', paths: { '/Info': 'Stav', '/b2c/orders': 'Objednávky' }, schemas: { 'Api.Models.Order': 'Objednávka', 'Api.Models.Info': 'Stav' } });
  const after = specWith({ build: '1.1.123', paths: { '/Info': 'Stav služby', '/products/prices': 'Ceny' }, schemas: { 'Api.Models.Order': 'Objednávka B2C', 'Api.Models.Price': 'Cena' } });
  await run({ ...bothAt('1.1.122'), 'https://api-test.example/swagger.json': respond(before) }, dir);

  const { results } = await run({ ...bothAt('1.1.122'), 'https://api-test.example/swagger.json': respond(after) }, dir);

  assert.deepEqual(results[1], {
    slug: 'test',
    status: 'changed',
    build: '1.1.123',
    previousBuild: '1.1.122',
    changes: {
      operations: { added: ['GET /products/prices'], removed: ['GET /b2c/orders'], changed: ['GET /Info'] },
      schemas: { added: ['Price'], removed: ['Info'], changed: ['Order'] },
    },
  });
});

const NO_CHANGES = { operations: { added: [], removed: [], changed: [] }, schemas: { added: [], removed: [], changed: [] } };

/** Předmět zprávy commitu: její první řádek. */
const subjectOf = (results) => commitMessage(results).split('\n')[0];

test('zpráva commitu jmenuje změněné prostředí a nové číslo buildu', () => {
  const results = [
    { slug: 'prod', status: 'unchanged' },
    { slug: 'test', status: 'changed', build: '1.1.123', previousBuild: '1.1.100', changes: NO_CHANGES },
  ];
  assert.equal(subjectOf(results), 'chore(spec): aktualizace specifikace TEST na build 1.1.123');
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
    { slug: 'prod', status: 'changed', build: '1.1.123', previousBuild: '1.1.100', changes: NO_CHANGES },
    { slug: 'test', status: 'changed', build: '1.1.123', previousBuild: '1.1.100', changes: NO_CHANGES },
  ];
  assert.equal(subjectOf(results), 'chore(spec): aktualizace specifikace PROD a TEST na build 1.1.123');
});

test('zpráva commitu při změně prostředí na různé buildy uvede build u každého prostředí', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: '1.1.123', previousBuild: '1.1.100', changes: NO_CHANGES },
    { slug: 'test', status: 'changed', build: '1.1.124', previousBuild: '1.1.100', changes: NO_CHANGES },
  ];
  assert.equal(subjectOf(results), 'chore(spec): aktualizace specifikace PROD na build 1.1.123 a TEST na build 1.1.124');
});

test('zpráva commitu u specifikace bez čísla buildu jmenuje jen prostředí', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: null, previousBuild: '1.1.100', changes: NO_CHANGES },
    { slug: 'test', status: 'unchanged' },
  ];
  assert.equal(subjectOf(results), 'chore(spec): aktualizace specifikace PROD');
});

test('zpráva commitu uvede prostředí bez čísla buildu až za prostředími s buildem', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: null, previousBuild: '1.1.100', changes: NO_CHANGES },
    { slug: 'test', status: 'changed', build: '1.1.124', previousBuild: '1.1.100', changes: NO_CHANGES },
  ];
  // „PROD a TEST na build 1.1.124“ by se četlo, jako by nový build měla obě prostředí.
  assert.equal(subjectOf(results), 'chore(spec): aktualizace specifikace TEST na build 1.1.124 a PROD');
});

test('tělo zprávy commitu uvede u prostředí předchozí a nový build a vyjmenuje přidané, odebrané a změněné operace a schémata', () => {
  const results = [
    { slug: 'prod', status: 'unchanged' },
    {
      slug: 'test',
      status: 'changed',
      build: '1.1.123',
      previousBuild: '1.1.122',
      changes: {
        operations: { added: ['GET /products/prices', 'POST /products/prices'], removed: ['GET /b2c/orders'], changed: ['GET /Info'] },
        schemas: { added: ['Price'], removed: [], changed: ['Order', 'Info'] },
      },
    },
  ];

  assert.equal(
    commitMessage(results),
    [
      'chore(spec): aktualizace specifikace TEST na build 1.1.123',
      '',
      'TEST: build 1.1.122 → 1.1.123',
      '- přidané operace (2): GET /products/prices, POST /products/prices',
      '- odebrané operace (1): GET /b2c/orders',
      '- změněné operace (1): GET /Info',
      '- přidaná schémata (1): Price',
      '- změněná schémata (2): Order, Info',
    ].join('\n'),
  );
});

/** Tělo zprávy commitu: vše za předmětem a prázdným řádkem. */
const bodyOf = (results, options) => commitMessage(results, options).split('\n').slice(2).join('\n');

test('tělo zprávy u prvního uložení specifikace neuvádí předchozí build ani změny', () => {
  const results = [{ slug: 'prod', status: 'changed', build: '1.1.122', previousBuild: null, changes: null }];
  assert.equal(bodyOf(results), 'PROD: první uložení, build 1.1.122');
});

test('tělo zprávy řekne, když se číslo buildu nezměnilo nebo ho nejde vyčíst', () => {
  const changes = { ...NO_CHANGES, operations: { ...NO_CHANGES.operations, changed: ['GET /Info'] } };
  assert.equal(
    bodyOf([{ slug: 'prod', status: 'changed', build: '1.1.122', previousBuild: '1.1.122', changes }]),
    'PROD: build 1.1.122, číslo buildu se nezměnilo\n- změněné operace (1): GET /Info',
  );
  assert.equal(
    bodyOf([{ slug: 'prod', status: 'changed', build: null, previousBuild: '1.1.122', changes }]),
    'PROD: build 1.1.122 → neznámý\n- změněné operace (1): GET /Info',
  );
});

test('tělo zprávy řekne, když se operace ani schémata nezměnily', () => {
  const results = [{ slug: 'test', status: 'changed', build: '1.1.123', previousBuild: '1.1.122', changes: NO_CHANGES }];
  assert.equal(bodyOf(results), 'TEST: build 1.1.122 → 1.1.123\n- operace ani schémata se nezměnily, změna je jinde ve specifikaci');
});

test('tělo zprávy popíše každé změněné prostředí zvlášť a na konci odkáže na běh workflow', () => {
  const results = [
    { slug: 'prod', status: 'changed', build: '1.1.123', previousBuild: '1.1.122', changes: NO_CHANGES },
    { slug: 'test', status: 'changed', build: '1.1.124', previousBuild: '1.1.123', changes: { ...NO_CHANGES, schemas: { ...NO_CHANGES.schemas, added: ['Price'] } } },
  ];
  assert.equal(
    bodyOf(results, { runUrl: 'https://github.example/org/repo/actions/runs/42' }),
    [
      'PROD: build 1.1.122 → 1.1.123',
      '- operace ani schémata se nezměnily, změna je jinde ve specifikaci',
      '',
      'TEST: build 1.1.123 → 1.1.124',
      '- přidaná schémata (1): Price',
      '',
      'Běh workflow: https://github.example/org/repo/actions/runs/42',
    ].join('\n'),
  );
});

test('dlouhý výčet tělo zprávy zkrátí a názvy s řídicími znaky zapíše na jeden řádek', () => {
  const added = Array.from({ length: 23 }, (_, index) => `GET /codelists/c${index + 1}`);
  const changes = { ...NO_CHANGES, operations: { added, removed: [], changed: ['GET /a\nb\r\n::error::x'] } };
  const lines = bodyOf([{ slug: 'test', status: 'changed', build: '1.1.123', previousBuild: '1.1.122', changes }]).split('\n');

  assert.equal(lines.length, 3);
  assert.equal(lines[1], `- přidané operace (23): ${added.slice(0, 20).join(', ')} a další (3)`);
  assert.equal(lines[2], '- změněné operace (1): GET /a b ::error::x');
});

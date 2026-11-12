// Ověří sestavený web ve skutečném prohlížeči: co testy nad soubory nevidí.
//
// Sestaví web do dočasné složky, pustí ho z podsložky na místním serveru
// a v Chrome bez okna zkontroluje pro každý jazyk, na místní adrese i pod
// názvem hostitele, který vypadá veřejně (Scalar se na localhostu chová jinak):
//   - menu ukazuje všechny operace každého prostředí a přepínač nabízí všechna;
//     adresa operace vzniká z technického názvu skupiny, ne ze zobrazovaného,
//   - stránka při načtení ani procházení nevolá žádnou cizí adresu (docs/adr/0002),
//   - úložiště prohlížeče je prázdné, dokud návštěvník nepřepne barevný režim
//     nebo jazyk ukázek kódu; na tom stojí zásady ochrany osobních údajů,
//   - tlačítka, která volají API nebo servery Scalaru, jsou skrytá (docs/adr/0003).
//
// Spouštěj po změně stránky, motivu, nastavení nebo verze Scalaru: npm run verify
// Potřebuje nainstalovaný Chrome nebo Chromium; cestu lze určit proměnnou CHROME_PATH.
// Skript hledá prvky podle popisků v rozhraní Scalaru; když je změní překlad
// rozhraní nebo nová verze Scalaru, uprav konstanty níže.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, siteInputs } from './build.mjs';
import { operations } from './openapi.mjs';

/** Podsložka, ze které se web servíruje, aby se ověřily relativní cesty. */
const SUBFOLDER = '/nejaka/podslozka/web/';
/** Název hostitele, který pro Scalar není localhost; Chrome ho překládá na místní adresu. */
const PUBLIC_HOST = 'docs.example.test';
const LANGUAGE_DIRS = ['', 'en/'];

/** Popisky tlačítek a odkazů, které na stránce být nesmějí; hledají se jako celá slova. */
const FORBIDDEN_LABELS = ['Test Request', 'Open API Client', 'Ask AI', 'Developer Tools', 'Generate SDK', 'Deploy', 'Share', 'Configure'];
/** Začátek popisku tlačítka pro stažení OpenAPI dokumentu. */
const DOWNLOAD_LABEL = 'Download OpenAPI Document';
/** Začátek popisku výběru jazyka ukázky kódu u operace. */
const CODE_SAMPLE_LABEL = 'Change code sample language';
/** Jazyk ukázek kódu, na který skript přepne. */
const OTHER_CLIENT = 'Python';
/** Klíče, které smí Scalar zapsat do úložiště: barevný režim a jazyk ukázek kódu. */
const COLOR_MODE_KEY = 'colorMode';
const CLIENT_KEY = 'scalar-reference-selected-client-v2';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Statický server nad složkou, dostupný jen pod podsložkou SUBFOLDER. */
async function serve(dir) {
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const relative = pathname.startsWith(SUBFOLDER) ? decodeURIComponent(pathname.slice(SUBFOLDER.length)) : null;
    const path = relative === null ? null : normalize(join(dir, relative.endsWith('/') || relative === '' ? `${relative}index.html` : relative));
    if (!path || !path.startsWith(dir + sep)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, close: () => server.close() };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Chrome ani Chromium se nenašel; nastav cestu v proměnné CHROME_PATH');
  return found;
}

/** Spustí Chrome bez okna s vlastním dočasným profilem a vrátí port DevTools protokolu. */
async function launchChrome(profileDir) {
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1400,1000',
      `--host-resolver-rules=MAP ${PUBLIC_HOST} 127.0.0.1`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (existsSync(portFile)) {
      const port = Number((await readFile(portFile, 'utf8')).split('\n')[0]);
      if (port) return { port, close: () => chrome.kill() };
    }
    await sleep(100);
  }
  chrome.kill();
  throw new Error('Chrome se nepodařilo spustit');
}

/** Otevře novou kartu a vrátí ovládání přes DevTools protokol. */
async function openPage(debugPort) {
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let lastId = 0;
  const pending = new Map();
  const requests = [];
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method === 'Network.requestWillBeSent') {
      requests.push(message.params.request.url);
    } else if (message.method === 'Network.webSocketCreated') {
      requests.push(message.params.url);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++lastId, { resolve, reject });
      socket.send(JSON.stringify({ id: lastId, method, params }));
    });
  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  /** Čeká, až výraz v prohlížeči vrátí pravdivou hodnotu. */
  const waitFor = async (expression, what) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await evaluate(expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`nedočkal jsem se: ${what}`);
  };
  /** Klikne na prvek, který výraz najde; vrací, jestli nějaký našel. */
  const click = (elementExpression) => evaluate(`(() => { const element = ${elementExpression}; element?.click(); return Boolean(element); })()`);

  return {
    send,
    evaluate,
    waitFor,
    click,
    requests,
    errors,
    close: async () => {
      socket.close();
      await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`);
    },
  };
}

// Výrazy vyhodnocované v prohlížeči.
const LABEL = `((element) => element.getAttribute('aria-label') || element.textContent.trim())`;
const STORAGE = `(async () => ({
  localStorage: Object.keys(localStorage).sort(),
  sessionStorage: Object.keys(sessionStorage).sort(),
  cookies: document.cookie,
  indexedDB: (await indexedDB.databases()).map((database) => database.name),
  caches: typeof caches === 'undefined' ? [] : await caches.keys(),
}))()`;
const EMPTY_STORAGE = { localStorage: [], sessionStorage: [], cookies: '', indexedDB: [], caches: [] };
const buttonStartingWith = (label) =>
  `[...document.querySelectorAll('button')].find((button) => ${LABEL}(button).startsWith(${JSON.stringify(label)}))`;
const operationLinks = (slug) =>
  `[...document.querySelectorAll('aside a')].map((link) => link.getAttribute('href')).filter((href) => /^#${slug}\\/tag\\/[^/]+\\/[A-Z]+\\//.test(href ?? ''))`;

/**
 * Adresy operací, které má menu nabídnout pro specifikaci prostředí, jak ji
 * build zapsal: `#<prostředí>/tag/<skupina malými písmeny>/<METODA><cesta>`.
 * Zobrazovaný název skupiny (x-displayName) adresu měnit nesmí.
 */
async function operationAddresses(specPath, slug) {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  return [...operations(spec)]
    .map(({ path, method, operation }) => `#${slug}/tag/${operation.tags[0].toLowerCase()}/${method.toUpperCase()}${path}`)
    .sort();
}

/** Rozdíl mezi adresami operací v menu a ve specifikaci, nebo null, když se shodují. */
function addressMismatch(slug, inMenu, expected) {
  const missing = expected.filter((address) => !inMenu.includes(address));
  const extra = inMenu.filter((address) => !expected.includes(address));
  if (missing.length === 0 && extra.length === 0 && inMenu.length === expected.length) return null;
  return `${slug}: v menu je ${inMenu.length} operací, ve specifikaci ${expected.length}; chybí: ${missing.join(', ') || 'nic'}; navíc: ${extra.join(', ') || 'nic'}`;
}

/**
 * Projde jednu stránku a vrátí seznam zjištěných problémů (prázdný = v pořádku).
 */
async function verifyPage({ debugPort, url, environments, expectedOperations }) {
  const problems = [];
  const expect = (condition, problem) => {
    if (!condition) problems.push(problem);
  };
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const origin = new URL(url).origin;
  const defaultEnvironment = environments.find((environment) => environment.default);
  const otherEnvironment = environments.find((environment) => !environment.default);
  const page = await openPage(debugPort);

  try {
    await page.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    await page.send('Page.navigate', { url });
    await page.waitFor(`document.querySelectorAll('aside a').length > 0 && document.querySelector('h1')`, 'vykreslení reference');
    await sleep(1500);

    // Po načtení: výchozí prostředí, prázdné úložiště.
    expect((await page.evaluate('location.hash')).startsWith(`#${defaultEnvironment.slug}/`), 'výchozí prostředí není v adrese');
    expect((await page.evaluate(`document.querySelector('h1').textContent.trim()`)) === defaultEnvironment.title, 'titulek není název výchozího prostředí');
    expect(same(await page.evaluate(STORAGE), EMPTY_STORAGE), `úložiště není po načtení prázdné: ${JSON.stringify(await page.evaluate(STORAGE))}`);

    /** Rozbalí všechny skupiny v menu; přepínač prostředí (první rozbalovací tlačítko) vynechá. */
    const openGroups = async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const opened = await page.click(`[...document.querySelectorAll('aside button[aria-expanded="false"]')].find((button) => !${JSON.stringify(environments.map((e) => e.title))}.some((title) => button.textContent.includes(title)))`);
        if (!opened) return;
        await sleep(250);
      }
    };
    const forbiddenLabels = () =>
      page.evaluate(`${JSON.stringify(FORBIDDEN_LABELS)}.filter((label) => [...document.querySelectorAll('button, a')].some((element) => new RegExp('\\\\b' + label + '\\\\b').test(${LABEL}(element))))`);

    // Menu výchozího prostředí a procházení všech operací.
    await openGroups();
    const menuLinks = await page.evaluate(operationLinks(defaultEnvironment.slug));
    const defaultMismatch = addressMismatch(defaultEnvironment.slug, menuLinks, expectedOperations[defaultEnvironment.slug]);
    expect(!defaultMismatch, defaultMismatch);
    const seenForbidden = new Set(await forbiddenLabels());
    for (const href of menuLinks) {
      await page.click(`document.querySelector('aside a[href=${JSON.stringify(href)}]')`);
      await sleep(200);
      for (const label of await forbiddenLabels()) seenForbidden.add(label);
    }
    await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await sleep(500);
    expect(seenForbidden.size === 0, `na stránce jsou skrytá tlačítka: ${[...seenForbidden].join(', ')}`);
    expect(await page.evaluate(`Boolean(${buttonStartingWith(DOWNLOAD_LABEL)})`), 'chybí stažení OpenAPI dokumentu');
    expect(await page.evaluate(`Boolean(${buttonStartingWith(CODE_SAMPLE_LABEL)})`), 'chybí ukázky kódu');
    expect(same(await page.evaluate(STORAGE), EMPTY_STORAGE), 'úložiště není po procházení prázdné');

    // Přepínač prostředí.
    await page.click(`[...document.querySelectorAll('aside button[aria-expanded]')].find((button) => button.textContent.includes(${JSON.stringify(defaultEnvironment.title)}))`);
    const options = await page.waitFor(`(() => { const options = [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent.trim()); return options.length ? options : null; })()`, 'nabídka přepínače prostředí');
    expect(same(options, environments.map((environment) => environment.title)), `přepínač nabízí: ${options.join(', ')}`);
    await page.click(`[...document.querySelectorAll('[role="option"]')].find((option) => option.textContent.includes(${JSON.stringify(otherEnvironment.title)}))`);
    await page.waitFor(`location.hash.startsWith('#${otherEnvironment.slug}') && document.querySelector('h1')?.textContent.trim() === ${JSON.stringify(otherEnvironment.title)}`, `přepnutí na ${otherEnvironment.slug}`);
    await sleep(500);
    await openGroups();
    const otherMismatch = addressMismatch(otherEnvironment.slug, await page.evaluate(operationLinks(otherEnvironment.slug)), expectedOperations[otherEnvironment.slug]);
    expect(!otherMismatch, otherMismatch);
    expect(same(await page.evaluate(STORAGE), EMPTY_STORAGE), 'úložiště není po přepnutí prostředí prázdné');

    // Barevný režim: přepne se bez načtení stránky a uloží jen svou volbu.
    const modeBefore = await page.evaluate('document.body.className');
    expect(/\b(light|dark)-mode\b/.test(modeBefore), `body nemá třídu barevného režimu: ${modeBefore}`);
    expect(await page.click(`document.querySelector('aside button[aria-pressed]')`), 'chybí přepínač barevného režimu');
    await sleep(300);
    expect((await page.evaluate('document.body.className')) !== modeBefore, 'barevný režim se nepřepnul');
    expect(same((await page.evaluate(STORAGE)).localStorage, [COLOR_MODE_KEY]), 'po přepnutí režimu je v úložišti něco jiného než barevný režim');

    // Jazyk ukázek kódu.
    expect(await page.click(buttonStartingWith(OTHER_CLIENT)), `chybí tlačítko jazyka ukázek ${OTHER_CLIENT}`);
    await sleep(500);
    const finalStorage = await page.evaluate(STORAGE);
    expect(same(finalStorage, { ...EMPTY_STORAGE, localStorage: [COLOR_MODE_KEY, CLIENT_KEY].sort() }), `úložiště po přepnutí režimu a jazyka ukázek: ${JSON.stringify(finalStorage)}`);

    // Síť a chyby.
    const foreign = [...new Set(page.requests)].filter((request) => new URL(request).origin !== origin);
    expect(foreign.length === 0, `požadavky na cizí adresy: ${foreign.join(', ')}`);
    expect(page.errors.length === 0, `chyby v konzoli: ${page.errors.join(' | ')}`);
  } catch (error) {
    problems.push(error.message);
  } finally {
    await page.close();
  }
  return problems;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = await mkdtemp(join(tmpdir(), 'verify-browser-'));
const outDir = join(workDir, 'dist');
let server;
let chrome;
let failed = false;
try {
  const inputs = await siteInputs(repoRoot);
  await build({ ...inputs, outDir, log: { info: () => {}, warn: console.warn } });
  server = await serve(outDir);
  chrome = await launchChrome(join(workDir, 'profile'));

  for (const languageDir of LANGUAGE_DIRS) {
    const expectedOperations = {};
    for (const { slug } of inputs.environments) {
      expectedOperations[slug] = await operationAddresses(join(outDir, languageDir, `openapi.${slug}.json`), slug);
    }
    for (const host of ['127.0.0.1', PUBLIC_HOST]) {
      const url = `http://${host}:${server.port}${SUBFOLDER}${languageDir}`;
      const problems = await verifyPage({ debugPort: chrome.port, url, environments: inputs.environments, expectedOperations });
      const label = `${languageDir || 'cs/'} na ${host}`;
      if (problems.length === 0) {
        console.log(`✔ ${label}: operací ${Object.entries(expectedOperations).map(([slug, addresses]) => `${slug.toUpperCase()} ${addresses.length}`).join(', ')}; žádná cizí adresa; úložiště v pořádku`);
      } else {
        failed = true;
        console.error(`✖ ${label}`);
        for (const problem of problems) console.error(`    ${problem}`);
      }
    }
  }
} finally {
  chrome?.close();
  server?.close();
  await sleep(300);
  await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(failed ? 1 : 0);

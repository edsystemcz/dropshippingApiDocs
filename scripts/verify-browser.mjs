// Ověří sestavený web ve skutečném prohlížeči: co testy nad soubory nevidí.
//
// Sestaví web do dočasné složky, pustí ho z podsložky na místním serveru
// a v Chrome bez okna zkontroluje pro každý jazyk, na místní adrese i pod
// názvem hostitele, který vypadá veřejně (Scalar se na localhostu chová jinak):
//   - menu ukazuje všechny operace každého prostředí a přepínač nabízí všechna;
//     adresa operace vzniká z technického názvu skupiny, ne ze zobrazovaného,
//   - položky menu z nadpisů úvodu a odkazy mezi texty, které build převedl na
//     adresy ve Scalaru (scripts/scalar-addresses.mjs), vedou na existující místo,
//   - stránka při načtení ani procházení nevolá žádnou cizí adresu (docs/adr/0002),
//   - přepínač jazyka vede oběma směry z operace na stejnou operaci a z kapitoly
//     úvodu na začátek úvodu, zvolené prostředí zůstává,
//   - úložiště prohlížeče je prázdné, dokud návštěvník nepřepne barevný režim
//     nebo jazyk ukázek kódu; na tom stojí zásady ochrany osobních údajů,
//   - tlačítka, která volají API nebo servery Scalaru, jsou skrytá (docs/adr/0003),
//   - záhlaví s logem nepřekrývá menu ani přepínač režimu a cíle odkazů končí pod
//     ním, na počítači i na mobilu (tam je logo vpravo na řádku s tlačítkem
//     menu a název oddílu před ním zůstává vidět celý);
//     logo vede na úvod zvoleného prostředí,
//   - přepnutí režimu bez načtení stránky změní motiv i barvu textu loga,
//   - text v barvě akcentu, v zelené a v barvách syntaxe ukázek
//     kódu má kontrast aspoň 4,5:1 na pozadí, na kterém je, v obou režimech,
//     i pod myší a ve vyhledávání;
//     kód v odkazu má barvu odkazu a žádné pozadí; vyhledávání záhlaví
//     nezakrývá a nic neukládá do úložiště.
//
// Spouštěj po změně stránky, motivu, nastavení nebo verze Scalaru: npm run verify
// Potřebuje nainstalovaný Chrome nebo Chromium; cestu lze určit proměnnou CHROME_PATH.
// Skript hledá prvky podle popisků v rozhraní Scalaru v jazyce verze (klíče
// překladů v konstantách níže); když nová verze Scalaru klíče změní, uprav je.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, siteInputs } from './build.mjs';
import { composite, contrastRatio, MIN_CONTRAST, relativeLuminance } from './contrast.mjs';
import { environmentLabel } from './environments.mjs';
import { linkDestinations } from './markdown.mjs';
import { operations } from './openapi.mjs';
import { operationAddress } from './scalar-addresses.mjs';

/** Podsložka, ze které se web servíruje, aby se ověřily relativní cesty. */
const SUBFOLDER = '/nejaka/podslozka/web/';
/** Název hostitele, který pro Scalar není localhost; Chrome ho překládá na místní adresu. */
const PUBLIC_HOST = 'docs.example.test';
/** Jazykové verze: složka ve výstupu a překlad rozhraní Scalaru (bez něj vestavěná angličtina). */
const LANGUAGES = [
  { dir: '', label: 'cs/', scalarTranslations: 'i18n/scalar.cs.json' },
  { dir: 'en/', label: 'en/' },
];

/**
 * Popisky prvků rozhraní Scalaru podle klíče jeho překladů. Na stránce se
 * hledají v jazyce verze: anglicky z balíčku Scalaru, česky z překladu
 * rozhraní; chybějící překlad Scalar ukáže anglicky.
 */
const LABEL_KEYS = {
  /** Začátek popisku tlačítka pro stažení OpenAPI dokumentu. */
  download: 'download.openapi',
  /** Začátek popisku výběru jazyka ukázky kódu u operace. */
  codeSample: 'clientLibraries.changeClient',
  /** Popisek tlačítka, které na mobilu otevře menu. */
  openMenu: 'navigation.openMenu',
  /** Popisek tlačítka, které otevře vyhledávání. */
  openSearch: 'search.open',
};
/** Popisky tlačítek a odkazů, které na stránce být nesmějí, podle klíče překladů; hledají se jako celá slova. */
const FORBIDDEN_LABEL_KEYS = ['operation.testRequest', 'agent.askAi', 'developerTools.title', 'sdk.generate', 'developerTools.deploy', 'developerTools.share', 'developerTools.configure'];
/** Zakázané popisky, které Scalar nepřekládá. */
const FORBIDDEN_FIXED_LABELS = ['Open API Client'];
/** Okno telefonu pro kontrolu rozvržení na mobilu. */
const MOBILE_SCREEN = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
/** Barva textu loga podle třídy barevného režimu na body (ZADANI část 12). */
const LOGO_COLORS = { 'light-mode': 'rgb(83, 86, 90)', 'dark-mode': 'rgb(255, 255, 255)' };
/**
 * Proměnné Scalaru s barvami akcentu a zelenou (metoda POST); text v nich
 * hlídá kontrola kontrastu. Oranžovou a žlutou zvolil zadavatel pod 4,5:1.
 * V ukázkách kódu hlídá i barvy syntaxe, které motiv definuje jako
 * proměnné --code-*.
 */
const CONTRAST_VARIABLES = ['--scalar-color-accent', '--scalar-link-color', '--scalar-sidebar-color-active', '--scalar-color-green'];
/** Co skript napíše do vyhledávání. */
const SEARCH_QUERY = 'katalog';
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
/** Kódy kláves, které skript tiskne. */
const KEY_CODES = { ArrowDown: 40, Escape: 27 };

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
  /** Posune prvek do okna a vrátí jeho střed, nebo null, když prvek není. */
  const centerOf = (elementExpression) =>
    evaluate(`(() => {
      const element = ${elementExpression};
      if (!element) return null;
      element.scrollIntoView({ block: 'nearest' });
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
  /**
   * Klepne doprostřed prvku jako uživatel. Tlačítko menu na mobilu a tlačítko
   * vyhledávání na click() z kódu nereagují. Vrací, jestli prvek našel.
   */
  const tap = async (elementExpression) => {
    const point = await centerOf(elementExpression);
    if (!point) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    return true;
  };
  /** Najede myší doprostřed prvku; vrací, jestli prvek našel. */
  const hover = async (elementExpression) => {
    const point = await centerOf(elementExpression);
    if (!point) return false;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    return true;
  };
  /** Stiskne a pustí klávesu z KEY_CODES. */
  const press = async (key) => {
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: KEY_CODES[key] });
  };

  return {
    send,
    evaluate,
    waitFor,
    click,
    tap,
    hover,
    press,
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
/** Výraz pro prohlížeč: vrací, jestli prvek není zakrytý jiným (třeba záhlavím). */
const uncovered = (elementExpression) => `(() => {
  const element = ${elementExpression};
  if (!element?.checkVisibility()) return false;
  const rect = element.getBoundingClientRect();
  const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return element === top || element.contains(top);
})()`;
/**
 * Spodní okraj lišt u horního okraje okna: záhlaví webu a lišt Scalaru, které
 * na něj navazují nebo ho překrývají (na mobilu lišta s tlačítkem menu).
 * Skládá je jako Scalar při posunu ke kotvě. Pod ním má začínat menu i cíl odkazu.
 */
const TOP_BARS_BOTTOM = `(() => {
  const bars = [...document.querySelectorAll('[data-scalar-scroll-header]')]
    .map((bar) => bar.getBoundingClientRect())
    .filter((rect) => rect.height > 0)
    .sort((a, b) => a.top - b.top);
  let bottom = 0;
  for (const rect of bars) if (rect.top <= bottom + 1) bottom = Math.max(bottom, rect.bottom);
  return bottom;
})()`;
/** Výraz pro prohlížeč: vrací, jestli svislé středy dvou prvků leží na stejném řádku. */
const sameRow = (firstExpression, secondExpression) => `(() => {
  const middle = (element) => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; };
  return Math.abs(middle(${firstExpression}) - middle(${secondExpression})) <= 1;
})()`;
/**
 * Kód v odkazech, který nemá barvu odkazu nebo má vlastní pozadí. Písmo kódu
 * zůstává; vypsaný je text a barvy.
 */
const STYLED_CODE_IN_LINKS = `[...document.querySelectorAll('a code')].filter((code) => code.checkVisibility()).flatMap((code) => {
  const style = getComputedStyle(code);
  const linkColor = getComputedStyle(code.closest('a')).color;
  if (style.color === linkColor && style.backgroundColor === 'rgba(0, 0, 0, 0)') return [];
  return [code.textContent.trim().slice(0, 40) + ' (' + style.color + ' na ' + style.backgroundColor + ', odkaz ' + linkColor + ')'];
})`;
/** Horní okraj místa, na které ukazuje adresa za #, nebo null, když na stránce není. */
const TARGET_TOP = `document.getElementById(decodeURIComponent(location.hash.slice(1)))?.getBoundingClientRect().top ?? null`;
/** Výraz pro prohlížeč: vrací, jestli číslo `topExpression` (horní okraj) leží pod záhlavím a lištami. */
const belowTopBars = (topExpression) => `((${topExpression}) >= ${TOP_BARS_BOTTOM} - 1)`;
/** Barevný režim, barva textu loga a pozadí stránky. */
const COLOR_STATE = `({
  mode: ['light-mode', 'dark-mode'].find((mode) => document.body.classList.contains(mode)),
  logo: getComputedStyle(document.querySelector('.site-logo')).color,
  background: getComputedStyle(document.body).backgroundColor,
})`;
/**
 * Výraz pro prohlížeč: prvky s textem v barvě z CONTRAST_VARIABLES nebo, v ukázce
 * kódu, v barvě syntaxe z proměnných --code-* uvnitř `root`, jejichž
 * kontrast s pozadím (složeným z průhledných pozadí předků) je pod MIN_CONTRAST.
 * Výpočet kontrastu je ze scripts/contrast.mjs, předaný jako text.
 */
const lowContrast = (root = 'document.body') => `(() => {
  const composite = ${composite};
  const relativeLuminance = ${relativeLuminance};
  const contrastRatio = ${contrastRatio};
  /** Barva z computed style, třeba "rgba(1, 2, 3, 0.5)", jako [r, g, b, průhlednost]. */
  const parseRgb = (value) => {
    const inside = /rgba?\\(([^)]+)\\)/.exec(value)?.[1];
    if (!inside) return null;
    const [r, g, b, alpha = 1] = inside.split(/[\\s,/]+/).filter(Boolean).map(Number);
    return [r, g, b, alpha];
  };
  const probe = document.body.appendChild(document.createElement('span'));
  const colorsOf = (names) => new Set(names.map((name) => {
    probe.style.color = 'var(' + name + ')';
    return getComputedStyle(probe).color;
  }));
  const checked = colorsOf(${JSON.stringify(CONTRAST_VARIABLES)});
  const syntax = colorsOf([...getComputedStyle(document.body)].filter((name) => name.startsWith('--code-')));
  probe.remove();
  const background = (element) => {
    const layers = [];
    for (let e = element; e; e = e.parentElement) {
      const color = parseRgb(getComputedStyle(e).backgroundColor);
      if (color && color[3] > 0) layers.push(color);
      if (color?.[3] === 1) break;
    }
    return layers.reduceRight((below, layer) => composite(layer, below), [255, 255, 255, 1]);
  };
  const problems = [...(${root}).querySelectorAll('*')].flatMap((element) => {
    const hasText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const color = getComputedStyle(element).color;
    if (!hasText || !(checked.has(color) || (syntax.has(color) && element.closest('.hljs'))) || !element.checkVisibility()) return [];
    const behind = background(element);
    const ratio = contrastRatio(parseRgb(color), behind);
    if (ratio >= ${MIN_CONTRAST}) return [];
    return [element.textContent.trim().slice(0, 40) + ' (' + color + ' na rgb(' + behind.slice(0, 3).map(Math.round).join(', ') + '): ' + ratio.toFixed(2) + ':1)'];
  });
  return [...new Set(problems)];
})()`;
const operationLinks = (slug) =>
  `[...document.querySelectorAll('aside a')].map((link) => link.getAttribute('href')).filter((href) => /^#${slug}\\/tag\\/[^/]+\\/[A-Z]+\\//.test(href ?? ''))`;

/**
 * Co má stránka pro specifikaci prostředí, jak ji build zapsal, ukázat:
 * adresy operací v menu (zobrazovaný název skupiny je měnit nesmí) a cíle
 * odkazů `[text](#…)`, na které build převedl odkazy mezi texty. Navíc
 * operace s nejdelším názvem, který musí být na mobilu v liště vidět celý.
 */
async function expectedAddresses(specPath, slug) {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  const texts = [spec.info.description, ...(spec.tags ?? []).map((tag) => tag.description), ...[...operations(spec)].map(({ operation }) => operation.description)];
  return {
    operations: [...operations(spec)].map(({ path, method, operation }) => operationAddress(slug, operation.tags?.[0], method, path)).sort(),
    textLinks: [...new Set(texts.flatMap((text) => linkDestinations(text ?? '')).filter((destination) => destination.startsWith('#')))].sort(),
    longestOperation: [...operations(spec)]
      .map(({ path, method, operation }) => ({ address: operationAddress(slug, operation.tags?.[0], method, path), title: operation.summary ?? '' }))
      .reduce((longest, candidate) => (candidate.title.length > longest.title.length ? candidate : longest)),
  };
}

/**
 * Výraz pro prohlížeč: adresy z `targets` a z položek menu pro nadpisy úvodu,
 * které nikam nevedou. Nadpis úvodu musí být na stránce, skupina a operace
 * v rozbaleném menu (operace se vykreslují až při posunu k nim).
 */
const brokenAddresses = (slug, targets) => `(() => {
  const menu = [...document.querySelectorAll('aside a')].map((link) => decodeURIComponent(link.getAttribute('href') ?? ''));
  const isHeading = (address) => address.startsWith('#${slug}/description/');
  return [...new Set([...${JSON.stringify(targets)}, ...menu.filter(isHeading)])]
    .filter((address) => (isHeading(address) ? !document.getElementById(address.slice(1)) : !menu.includes(address)));
})()`;

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
async function verifyPage({ debugPort, url, environments, expected, labels }) {
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
    // Se záhlavím nad referencí zůstane po načtení v adrese jen prostředí (#prod).
    const startHash = await page.evaluate('location.hash');
    expect(startHash === `#${defaultEnvironment.slug}` || startHash.startsWith(`#${defaultEnvironment.slug}/`), `výchozí prostředí není v adrese: ${startHash}`);
    expect((await page.evaluate(`document.querySelector('h1').textContent.trim()`)) === defaultEnvironment.title, 'titulek není název výchozího prostředí');
    expect(same(await page.evaluate(STORAGE), EMPTY_STORAGE), `úložiště není po načtení prázdné: ${JSON.stringify(await page.evaluate(STORAGE))}`);

    // Záhlaví: menu začíná pod ním a nezakrývá logo ani přepínač režimu.
    expect(await page.evaluate(belowTopBars(`document.querySelector('aside').getBoundingClientRect().top`)), 'záhlaví překrývá menu');
    expect(await page.evaluate(uncovered(`document.querySelector('.site-logo')`)), 'logo není vidět');
    expect(await page.evaluate(uncovered(`document.querySelector('aside button[aria-pressed]')`)), 'přepínač barevného režimu není vidět');

    /** Rozbalí všechny skupiny v menu; přepínač prostředí (první rozbalovací tlačítko) vynechá. */
    const openGroups = async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const opened = await page.click(`[...document.querySelectorAll('aside button[aria-expanded="false"]')].find((button) => !${JSON.stringify(environments.map((e) => e.title))}.some((title) => button.textContent.includes(title)))`);
        if (!opened) return;
        await sleep(250);
      }
    };
    /** Po rozbalení menu: odkazy mezi texty a položky menu z nadpisů úvodu vedou na existující místo. */
    const expectAddressesLead = async (slug) => {
      const broken = await page.evaluate(brokenAddresses(slug, expected[slug].textLinks));
      expect(broken.length === 0, `odkazy v textech nebo položky menu nikam nevedou: ${broken.join(', ')}`);
    };
    /** Hlásí text v barvě akcentu nebo zelené s nízkým kontrastem; `where` popisuje stav stránky. */
    const expectContrast = async (where, root) => {
      const { mode } = await page.evaluate(COLOR_STATE);
      const low = await page.evaluate(lowContrast(root));
      expect(low.length === 0, `text s kontrastem pod ${MIN_CONTRAST.toLocaleString('cs')}:1 (${mode}, ${where}): ${low.join('; ')}`);
    };
    /**
     * Kontrast při práci se stránkou: odkaz v textu a aktivní položka menu pod
     * myší a vybraný výsledek vyhledávání; vzhled kódu v odkazech.
     * Vyhledávání nesmí zakrýt záhlaví a nesmí nic uložit do úložiště.
     */
    const checkInteractions = async () => {
      expect(await page.click(`document.querySelector('.site-logo')`), 'chybí logo');
      await sleep(500);
      const textLink = `[...document.querySelectorAll('a[href^="#"]')].find((link) => !link.closest('aside, header') && link.checkVisibility())`;
      expect(await page.hover(textLink), 'v úvodu chybí odkaz v textu');
      await sleep(200);
      await expectContrast('odkaz v textu pod myší');
      const styledCode = await page.evaluate(STYLED_CODE_IN_LINKS);
      expect(styledCode.length === 0, `kód v odkazu nevypadá jako odkaz (${(await page.evaluate(COLOR_STATE)).mode}): ${styledCode.join('; ')}`);
      const menuOperation = `document.querySelector('aside a[href*="/GET/"]')`;
      expect(await page.click(menuOperation), 'v menu chybí operace');
      await sleep(500);
      await page.hover(menuOperation);
      await sleep(200);
      await expectContrast('aktivní položka menu pod myší');

      const storageBefore = await page.evaluate(STORAGE);
      expect(await page.tap(buttonStartingWith(labels.openSearch)), 'chybí tlačítko vyhledávání');
      const searchInput = `document.querySelector('[role="dialog"] input')`;
      await page.waitFor(`${searchInput} && ${searchInput} === document.activeElement`, 'otevření vyhledávání');
      await page.send('Input.insertText', { text: SEARCH_QUERY });
      await sleep(500);
      await page.press('ArrowDown');
      await sleep(200);
      expect(await page.evaluate(uncovered(searchInput)), 'záhlaví zakrývá vyhledávání');
      await expectContrast('vyhledávání', `document.querySelector('[role="dialog"]')`);
      await page.press('Escape');
      await page.waitFor(`!${searchInput}`, 'zavření vyhledávání');
      expect(same(await page.evaluate(STORAGE), storageBefore), 'vyhledávání zapsalo do úložiště');
    };
    // Celé slovo i s diakritikou: před a za popiskem není písmeno ani číslice.
    const forbiddenLabels = () =>
      page.evaluate(`${JSON.stringify(labels.forbidden)}.filter((label) => [...document.querySelectorAll('button, a')].some((element) => new RegExp('(?<![\\\\p{L}\\\\p{N}])' + label + '(?![\\\\p{L}\\\\p{N}])', 'u').test(${LABEL}(element))))`);

    // Menu výchozího prostředí a procházení všech operací.
    await openGroups();
    const menuLinks = await page.evaluate(operationLinks(defaultEnvironment.slug));
    const defaultMismatch = addressMismatch(defaultEnvironment.slug, menuLinks, expected[defaultEnvironment.slug].operations);
    expect(!defaultMismatch, defaultMismatch);
    await expectAddressesLead(defaultEnvironment.slug);
    const seenForbidden = new Set(await forbiddenLabels());
    const coveredTargets = [];
    for (const href of menuLinks) {
      await page.click(`document.querySelector('aside a[href=${JSON.stringify(href)}]')`);
      await sleep(200);
      for (const label of await forbiddenLabels()) seenForbidden.add(label);
      // Cíl, který na stránce není, hlásí kontrola odkazů výše.
      if (!(await page.evaluate(`(${TARGET_TOP}) === null || ${belowTopBars(TARGET_TOP)}`))) coveredTargets.push(href);
    }
    expect(coveredTargets.length === 0, `záhlaví zakrývá cíl odkazu: ${coveredTargets.join(', ')}`);
    await expectContrast('po procházení menu');
    await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await sleep(500);
    expect(seenForbidden.size === 0, `na stránce jsou skrytá tlačítka: ${[...seenForbidden].join(', ')}`);
    expect(await page.evaluate(`Boolean(${buttonStartingWith(labels.download)})`), 'chybí stažení OpenAPI dokumentu');
    expect(await page.evaluate(`Boolean(${buttonStartingWith(labels.codeSample)})`), 'chybí ukázky kódu');
    expect(same(await page.evaluate(STORAGE), EMPTY_STORAGE), 'úložiště není po procházení prázdné');

    // Přepínač prostředí.
    await page.click(`[...document.querySelectorAll('aside button[aria-expanded]')].find((button) => button.textContent.includes(${JSON.stringify(defaultEnvironment.title)}))`);
    const options = await page.waitFor(`(() => { const options = [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent.trim()); return options.length ? options : null; })()`, 'nabídka přepínače prostředí');
    expect(same(options, environments.map((environment) => environment.title)), `přepínač nabízí: ${options.join(', ')}`);
    await page.click(`[...document.querySelectorAll('[role="option"]')].find((option) => option.textContent.includes(${JSON.stringify(otherEnvironment.title)}))`);
    await page.waitFor(`location.hash.startsWith('#${otherEnvironment.slug}') && document.querySelector('h1')?.textContent.trim() === ${JSON.stringify(otherEnvironment.title)}`, `přepnutí na ${otherEnvironment.slug}`);
    await sleep(500);
    await openGroups();
    const otherMismatch = addressMismatch(otherEnvironment.slug, await page.evaluate(operationLinks(otherEnvironment.slug)), expected[otherEnvironment.slug].operations);
    expect(!otherMismatch, otherMismatch);
    await expectAddressesLead(otherEnvironment.slug);
    expect(same(await page.evaluate(STORAGE), EMPTY_STORAGE), 'úložiště není po přepnutí prostředí prázdné');

    // Logo vede na úvod zvoleného prostředí bez načtení stránky.
    await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); window.notReloaded = true');
    await sleep(300);
    expect(await page.click(`document.querySelector('.site-logo')`), 'chybí logo');
    await sleep(500);
    const introAddress = `#${otherEnvironment.slug}/description/introduction`;
    expect(decodeURIComponent(await page.evaluate('location.hash')) === introAddress, `logo nevede na ${introAddress}: ${await page.evaluate('location.hash')}`);
    expect(await page.evaluate(belowTopBars(TARGET_TOP)), 'po kliknutí na logo zakrývá záhlaví úvod');
    expect(await page.evaluate('window.notReloaded === true'), 'logo načetlo stránku znovu');

    // Barevný režim: přepne se bez načtení stránky, změní motiv i barvu loga
    // a uloží jen svou volbu.
    await checkInteractions();
    const lookBefore = await page.evaluate(COLOR_STATE);
    expect(lookBefore.mode, `body nemá třídu barevného režimu: ${await page.evaluate('document.body.className')}`);
    expect(lookBefore.logo === LOGO_COLORS[lookBefore.mode], `text loga má v režimu ${lookBefore.mode} barvu ${lookBefore.logo}`);
    expect(await page.click(`document.querySelector('aside button[aria-pressed]')`), 'chybí přepínač barevného režimu');
    await sleep(300);
    const lookAfter = await page.evaluate(COLOR_STATE);
    expect(lookAfter.mode && lookAfter.mode !== lookBefore.mode, 'barevný režim se nepřepnul');
    expect(lookAfter.logo === LOGO_COLORS[lookAfter.mode], `text loga má po přepnutí do režimu ${lookAfter.mode} barvu ${lookAfter.logo}`);
    expect(lookAfter.background !== lookBefore.background, 'po přepnutí režimu se nezměnilo pozadí stránky');
    expect(await page.evaluate('window.notReloaded === true'), 'přepnutí režimu načetlo stránku znovu');
    await expectContrast('po přepnutí režimu');
    await checkInteractions();
    expect(same((await page.evaluate(STORAGE)).localStorage, [COLOR_MODE_KEY]), 'po přepnutí režimu je v úložišti něco jiného než barevný režim');

    // Jazyk ukázek kódu.
    expect(await page.click(buttonStartingWith(OTHER_CLIENT)), `chybí tlačítko jazyka ukázek ${OTHER_CLIENT}`);
    await sleep(500);
    const finalStorage = await page.evaluate(STORAGE);
    expect(same(finalStorage, { ...EMPTY_STORAGE, localStorage: [COLOR_MODE_KEY, CLIENT_KEY].sort() }), `úložiště po přepnutí režimu a jazyka ukázek: ${JSON.stringify(finalStorage)}`);

    // Mobil: logo na jednom řádku s tlačítkem menu Scalaru, menu i cíl odkazu pod nimi.
    await page.send('Emulation.setDeviceMetricsOverride', MOBILE_SCREEN);
    await page.send('Page.reload');
    await page.waitFor(`document.querySelector('h1') && ${buttonStartingWith(labels.openMenu)}?.checkVisibility()`, 'vykreslení reference na mobilu');
    await sleep(1000);
    const logo = `document.querySelector('.site-logo')`;
    expect(await page.evaluate(uncovered(buttonStartingWith(labels.openMenu))), 'na mobilu záhlaví zakrývá tlačítko menu');
    expect(await page.evaluate(uncovered(logo)), 'na mobilu není vidět logo');
    expect(await page.evaluate(sameRow(logo, buttonStartingWith(labels.openMenu))), 'na mobilu není logo na řádku s tlačítkem menu');
    await page.tap(buttonStartingWith(labels.openMenu));
    const mobileMenu = `[...document.querySelectorAll('aside')].find((aside) => aside.checkVisibility())`;
    await page.waitFor(mobileMenu, 'otevření menu na mobilu');
    await sleep(300);
    expect(await page.evaluate(belowTopBars(`(${mobileMenu}).getBoundingClientRect().top`)), 'na mobilu záhlaví překrývá menu');
    expect(await page.evaluate(uncovered(`(${mobileMenu}).querySelector('button[aria-pressed]')`)), 'na mobilu není vidět přepínač barevného režimu');
    expect(await page.evaluate(uncovered(logo)), 'na mobilu není při otevřeném menu vidět logo');
    // Poslední skupina v menu: stránka se k ní musí posunout daleko.
    expect(await page.tap(`[...(${mobileMenu}).querySelectorAll('a[href*="/tag/"]')].at(-1)`), 'v menu na mobilu chybí skupiny');
    await sleep(1000);
    expect(await page.evaluate(belowTopBars(TARGET_TOP)), `na mobilu záhlaví zakrývá cíl odkazu ${await page.evaluate('location.hash')}`);
    // Název právě čteného oddílu ukazuje Scalar v liště za tlačítkem menu; logo je až za ním.
    // Menu zůstává otevřené, tlačítko lišty má teď popisek pro zavření.
    const sectionTitle = `document.querySelector('.t-doc__header header > span')`;
    const menuButton = `document.querySelector('.t-doc__header header > button')`;
    expect(await page.evaluate(`Boolean(${sectionTitle}?.textContent.trim()) && ${sectionTitle}.checkVisibility({ visibilityProperty: true })`), 'na mobilu není v liště vidět název oddílu');
    expect(
      await page.evaluate(`${sectionTitle}.getBoundingClientRect().right <= ${logo}.getBoundingClientRect().left && ${menuButton}.getBoundingClientRect().right <= ${sectionTitle}.getBoundingClientRect().left`),
      'na mobilu logo nestojí v liště vpravo za názvem oddílu',
    );
    // Operace s nejdelším názvem: název se zalomí nebo zmenší, ale je vidět celý.
    const { address: longAddress, title: longTitle } = expected[defaultEnvironment.slug].longestOperation;
    await page.tap(menuButton);
    await sleep(300);
    await page.evaluate(`location.hash = ${JSON.stringify(longAddress)}`);
    await page.waitFor(`${sectionTitle}?.textContent.trim() === ${JSON.stringify(longTitle)}`, `název ${longTitle} v liště na mobilu`);
    expect(
      await page.evaluate(`${sectionTitle}.scrollWidth <= ${sectionTitle}.clientWidth + 1 && ${sectionTitle}.scrollHeight <= ${sectionTitle}.clientHeight + 1 && ${sectionTitle}.getBoundingClientRect().right <= ${logo}.getBoundingClientRect().left`),
      `na mobilu není v liště vidět celý název ${longTitle}`,
    );

    // Síť a chyby.
    // Adresa `data:` nese obsah v sobě (ikona rámečku s upozorněním), po síti nic nejde.
    const foreign = [...new Set(page.requests)].filter((request) => !request.startsWith('data:') && new URL(request).origin !== origin);
    expect(foreign.length === 0, `požadavky na cizí adresy: ${foreign.join(', ')}`);
    expect(page.errors.length === 0, `chyby v konzoli: ${page.errors.join(' | ')}`);
  } catch (error) {
    problems.push(error.message);
  } finally {
    await page.close();
  }
  return problems;
}

/**
 * Přepínač jazyka na stránce `fromUrl` vede na stránku `toUrl`: z operace na
 * stejnou operaci, z kapitoly úvodu na začátek úvodu, a zvolené prostředí
 * zůstává. Zkouší se v prostředí, které není výchozí, aby bylo vidět, že
 * přepínač prostředí neztratí. Vrací seznam problémů.
 */
async function verifyLanguageSwitch({ debugPort, fromUrl, toUrl, environment, operation }) {
  const problems = [];
  const expect = (condition, problem) => {
    if (!condition) problems.push(problem);
  };
  const page = await openPage(debugPort);
  const toPath = new URL(toUrl).pathname;
  const rendered = (title) => `document.querySelectorAll('aside a').length > 0 && document.querySelector('h1')?.textContent.trim() === ${JSON.stringify(title)}`;
  /** Klepne na přepínač jazyka a počká na druhou verzi webu ve stejném prostředí. */
  const switchLanguage = async () => {
    expect(await page.tap(`document.querySelector('[data-language-switch]')`), 'chybí odkaz přepínače jazyka');
    await page.waitFor(`location.pathname === ${JSON.stringify(toPath)} && ${rendered(environment.title)}`, `přechod na ${toPath} v prostředí ${environment.slug}`);
    await sleep(1500);
  };
  const hash = () => page.evaluate('decodeURIComponent(location.hash)');
  try {
    // Z operace na stejnou operaci.
    await page.send('Page.navigate', { url: `${fromUrl}${operation}` });
    await page.waitFor(rendered(environment.title), `vykreslení ${operation}`);
    await sleep(1500);
    await switchLanguage();
    expect((await hash()) === operation, `přepínač jazyka z ${operation} vede na ${await hash()}`);
    expect(await page.evaluate(`(${TARGET_TOP}) !== null && ${belowTopBars(TARGET_TOP)}`), `po přepnutí jazyka není vidět ${operation}`);

    // Z kapitoly úvodu na začátek úvodu.
    await page.send('Page.navigate', { url: `${fromUrl}#${environment.slug}` });
    await page.waitFor(rendered(environment.title), 'vykreslení reference');
    await sleep(1000);
    const introPrefix = `#${environment.slug}/description/`;
    const introStart = `${introPrefix}introduction`;
    // Nadpis úvodu, jehož adresa se od začátku úvodu liší.
    const chapter = await page.waitFor(
      `(() => { const heading = [...document.querySelectorAll('[id]')].find(({ id }) => id.startsWith(${JSON.stringify(introPrefix.slice(1))}) && id !== ${JSON.stringify(introStart.slice(1))}); return heading && '#' + heading.id; })()`,
      `nadpis úvodu v prostředí ${environment.slug}`,
    );
    await page.evaluate(`location.hash = ${JSON.stringify(chapter)}`);
    await page.waitFor(rendered(environment.title), `přepnutí na ${chapter}`);
    await sleep(1000);
    await switchLanguage();
    expect((await hash()) === introStart, `přepínač jazyka z ${chapter} vede na ${await hash()}, ne na ${introStart}`);
    expect(await page.evaluate(`(${TARGET_TOP}) !== null && ${belowTopBars(TARGET_TOP)}`), 'po přepnutí jazyka z kapitoly úvodu není vidět začátek úvodu');
    expect(page.errors.length === 0, `chyby v konzoli: ${page.errors.join(' | ')}`);
  } catch (error) {
    problems.push(error.message);
  } finally {
    await page.close();
  }
  return problems;
}

/** Hodnota překladu podle klíče s tečkami (`search.open`), nebo undefined. */
const translationAt = (translations, key) => key.split('.').reduce((value, part) => value?.[part], translations);

/** Popisky rozhraní Scalaru pro jazykovou verzi; zakázané hledá anglicky i v jazyce verze. */
async function labelsFor(language) {
  const { en } = await import('../node_modules/@scalar/api-reference/dist/features/localization/locales/en.js');
  const translations = language.scalarTranslations ? JSON.parse(await readFile(join(repoRoot, language.scalarTranslations), 'utf8')) : {};
  const label = (key) => translationAt(translations, key) ?? translationAt(en, key);
  return {
    ...Object.fromEntries(Object.entries(LABEL_KEYS).map(([name, key]) => [name, label(key)])),
    forbidden: [...new Set([...FORBIDDEN_LABEL_KEYS.flatMap((key) => [translationAt(en, key), label(key)]), ...FORBIDDEN_FIXED_LABELS])],
  };
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

  const report = (label, problems, success) => {
    if (problems.length === 0) {
      console.log(`✔ ${label}: ${success}`);
    } else {
      failed = true;
      console.error(`✖ ${label}`);
      for (const problem of problems) console.error(`    ${problem}`);
    }
  };
  const pageUrl = (host, language) => `http://${host}:${server.port}${SUBFOLDER}${language.dir}`;
  for (const language of LANGUAGES) {
    const labels = await labelsFor(language);
    const expected = {};
    for (const { slug } of inputs.environments) {
      expected[slug] = await expectedAddresses(join(outDir, language.dir, `openapi.${slug}.json`), slug);
    }
    for (const host of ['127.0.0.1', PUBLIC_HOST]) {
      const url = pageUrl(host, language);
      const problems = await verifyPage({ debugPort: chrome.port, url, environments: inputs.environments, expected, labels });
      const label = `${language.label} na ${host}`;
      const counts = (pick) => Object.entries(expected).map(([slug, addresses]) => `${environmentLabel(slug)} ${pick(addresses).length}`).join(', ');
      report(label, problems, `operací ${counts((addresses) => addresses.operations)}; odkazů v textech ${counts((addresses) => addresses.textLinks)}; žádná cizí adresa; úložiště v pořádku`);
    }
  }
  // Přepínač jazyka oběma směry, v prostředí, které není výchozí.
  const environment = inputs.environments.find((candidate) => !candidate.default);
  const spec = JSON.parse(await readFile(join(outDir, `openapi.${environment.slug}.json`), 'utf8'));
  const { method, path, operation: switchOperation } = operations(spec).next().value;
  const operation = operationAddress(environment.slug, switchOperation.tags?.[0], method, path);
  for (const [from, to] of [LANGUAGES, [...LANGUAGES].reverse()]) {
    const problems = await verifyLanguageSwitch({ debugPort: chrome.port, fromUrl: pageUrl(PUBLIC_HOST, from), toUrl: pageUrl(PUBLIC_HOST, to), environment, operation });
    report(`přepínač jazyka ${from.label} → ${to.label}`, problems, `operace i úvod v prostředí ${environmentLabel(environment.slug)}`);
  }
} finally {
  chrome?.close();
  server?.close();
  await sleep(300);
  await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(failed ? 1 : 0);

// Kolekce pro Postman (ZADANI část 17, docs/adr/0003): build ji vytvoří
// z výsledné specifikace každého jazyka a prostředí oficiálním převodníkem
// Postmanu, aby vývojář mohl API volat z klienta na svém počítači.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import Ajv from 'ajv-draft-04';
import { mapProse, mapLinks } from './markdown.mjs';
import { mapStrings, operations } from './openapi.mjs';

const require = createRequire(import.meta.url);
const converter = require('openapi-to-postmanv2');
// Generátor ukázkových hodnot, kterým převodník doplňuje odpovědi bez příkladu.
const schemaFaker = require('openapi-to-postmanv2/assets/json-schema-faker.js');
// Datum by generátor počítal od aktuálního času; pevná ukázka drží kolekci stejnou.
const SAMPLE_DATE_TIME = '2026-01-01T12:00:00.000Z';
for (const format of ['date-time', 'datetime']) schemaFaker.format(format, () => SAMPLE_DATE_TIME);
schemaFaker.format('date', () => SAMPLE_DATE_TIME.slice(0, 10));

/** Oficiální schéma Postman Collection v2.1 (https://schema.postman.com/json/collection/v2.1.0/collection.json). */
const SCHEMA_PATH = new URL('../postman/collection.v2.1.0.schema.json', import.meta.url);

/**
 * Volby převodníku: složky podle skupin, hodnoty z příkladů ve specifikaci
 * a autentizace jen na úrovni kolekce, odkud ji požadavky dědí.
 */
const CONVERSION_OPTIONS = {
  folderStrategy: 'Tags',
  parametersResolution: 'Example',
  alwaysInheritAuthentication: true,
  enableOptionalParameters: false,
  includeAuthInfoInExample: false,
};

/**
 * Generátor pseudonáhodných čísel s pevným začátkem (mulberry32). Ukázkové
 * hodnoty pak vyjdou při každém buildu stejně a kolekce se mění, jen když
 * se změní specifikace.
 */
function seededRandom() {
  let state = 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Převede specifikaci OpenAPI na kolekci převodníkem Postmanu; `label` označuje jazykovou verzi prostředí v hlášení. */
function convert(spec, label) {
  schemaFaker.option({ random: seededRandom() });
  return new Promise((resolve, reject) => {
    converter.convertV2({ type: 'json', data: spec }, CONVERSION_OPTIONS, (error, result) => {
      if (error) reject(new Error(`${label}: převodník Postmanu selhal: ${error.message}`, { cause: error }));
      else if (!result.result) reject(new Error(`${label}: převodník Postmanu specifikaci nepřevedl: ${result.reason}`));
      else resolve(result.output[0].data);
    });
  });
}

/**
 * Validátor kolekcí proti schématu Postman Collection v2.1; neplatná kolekce
 * shodí build s místem chyby.
 * @returns {Promise<(collection: object, label: string) => void>}
 */
export async function collectionValidator() {
  const validate = new Ajv({ strict: false, allErrors: true }).compile(JSON.parse(await readFile(SCHEMA_PATH, 'utf8')));
  return (collection, label) => {
    if (validate(collection)) return;
    const details = [...new Set(validate.errors.map(({ instancePath, message }) => `${instancePath || '/'}: ${message}`))];
    throw new Error(`${label}: kolekce pro Postman neprošla validací schématem Postman Collection v2.1:\n  ${details.slice(0, 10).join('\n  ')}`);
  };
}

/**
 * Ručně psaná složka s požadavky na získání a obnovu tokenu (`auth.json`):
 * položka kolekce Postman v2.1, ve které je každý text pro lidi objekt se
 * zněním pro každý jazyk (`{"cs": "…", "en": "…"}`). Složené závorky jsou
 * proměnné Postmanu; zástupné symboly prostředí se tu nenahrazují.
 * @returns {Promise<{where: string, folder: object}>}
 */
export async function readPostmanAuth(postmanDir) {
  const path = join(postmanDir, 'auth.json');
  const where = `${basename(postmanDir)}/auth.json`;
  try {
    return { where, folder: JSON.parse(await readFile(path, 'utf8')) };
  } catch (error) {
    throw new Error(`${where}: soubor nejde přečíst jako JSON: ${error.message}`);
  }
}

/**
 * Hodnota s texty v jednom jazyce: objekt, jehož klíče jsou jen kódy jazyků,
 * nahradí znění pro `language`. Chybějící znění je chyba.
 */
function localized(value, language, languages, where, location = []) {
  if (Array.isArray(value)) return value.map((item, index) => localized(item, language, languages, where, [...location, index]));
  if (typeof value !== 'object' || value === null) return value;
  const keys = Object.keys(value);
  if (keys.length > 0 && keys.every((key) => languages.includes(key))) {
    if (typeof value[language] !== 'string') throw new Error(`${where}: ${location.join(' › ') || '/'} nemá znění pro jazyk ${language}`);
    return value[language];
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localized(item, language, languages, where, [...location, key])]));
}

/** Cíl odkazu s vlastním schématem (`https:`, `mailto:`); ostatní jsou relativní k webu. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Upozornění z GitHubu (`> [!WARNING]` a pod ním text), které Scalar kreslí jako rámeček. */
const ALERT = /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n> ?/gim;

/**
 * Texty specifikace upravené pro Postman. Odkazy relativní k webu (adresy
 * ve Scalaru `#prod/…` a soubory jako `postman.prod.json`) v Postmanu nikam
 * nevedou, proto dostanou úplnou adresu stránky jazykové verze. Upozornění,
 * které Postman neumí, se stane citací s tučným označením (`alertLabels`).
 */
const textsForPostman = (spec, pageUrl, alertLabels) =>
  mapStrings(spec, (text, key) => {
    if (key !== 'description') return text;
    const linked = mapLinks(text, (destination) => (ABSOLUTE.test(destination) ? undefined : new URL(destination, pageUrl).href));
    return mapProse(linked, (prose) => prose.replace(ALERT, (match, type) => `> **${alertLabels[type.toUpperCase()]}:** `));
  });

/**
 * Hlavičku `Accept` převodník bere z prvního typu obsahu odpovědi, ve zdroji
 * je to `text/plain`. Ukázky na webu chtějí JSON, proto se u odpovědí, které
 * ho nabízejí, posune `application/json` na začátek. Upravuje předanou specifikaci.
 */
function preferJson(spec) {
  for (const { operation } of operations(spec)) {
    for (const response of Object.values(operation.responses ?? {})) {
      const { content } = response;
      if (content?.['application/json']) response.content = { 'application/json': content['application/json'], ...content };
    }
  }
  return spec;
}

/** Autentizace celé kolekce; požadavky ji dědí, token uloží požadavek na jeho získání. */
const BEARER_AUTH = { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] };

/** Proměnné kolekce s přihlašovacími údaji a tokeny; v kolekci musejí být prázdné. */
const CREDENTIAL_VARIABLES = ['clientId', 'clientSecret', 'username', 'password', 'accessToken', 'refreshToken'];

/**
 * Proměnné kolekce: adresy podle prostředí, přihlašovací údaje prázdné
 * (vyplní je vývojář u sebe), tokeny, které uloží požadavky na token,
 * a hodnoty, které si předávají požadavky katalogu.
 */
const variables = ({ baseUrl, tokenUrl }) =>
  [
    ['baseUrl', baseUrl],
    ['tokenUrl', tokenUrl],
    ...[...CREDENTIAL_VARIABLES, 'transactionId', 'fileName'].map((key) => [key, '']),
  ].map(([key, value]) => ({ key, value, type: 'string' }));

/**
 * Návaznost požadavků katalogu: založení jobu uloží `transactionId`, zjištění
 * stavu ho použije a uloží `fileName`, který použije stažení katalogového
 * souboru. `uses` je parametr operace, do kterého se dosadí proměnná stejného
 * názvu; `saves` pole odpovědi, které se uloží do proměnné stejného názvu.
 * Operace, která v prostředí není, se přeskočí. Když operace parametr nemá
 * (API ho přejmenovalo), build jen varuje, aby změna API nezastavila
 * nasazení; zbytek kolekce funguje dál.
 */
const CHAINS = [
  { method: 'post', path: '/products/catalog', saves: 'transactionId' },
  { method: 'get', path: '/products/catalog', uses: { name: 'transactionId', in: 'query' }, saves: 'fileName' },
  { method: 'get', path: '/files/{fileName}', uses: { name: 'fileName', in: 'path' } },
];

/**
 * Testovací skript, který po úspěšné odpovědi uloží pole odpovědi do proměnné
 * kolekce. Zjištění stavu jobu vrací pole s jedním objektem, proto se bere
 * jeho první prvek.
 */
const saveScript = (field) => ({
  listen: 'test',
  script: {
    type: 'text/javascript',
    exec: [
      'if (pm.response.code >= 200 && pm.response.code < 300) {',
      '  const body = pm.response.json();',
      '  const result = Array.isArray(body) ? body[0] : body;',
      `  if (result && result.${field}) pm.collectionVariables.set('${field}', result.${field});`,
      '}',
    ],
  },
});

/** Cesta požadavku kolekce zapsaná jako ve specifikaci: `:fileName` → `{fileName}`. */
const specPath = (url) => `/${url.path.map((segment) => (segment.startsWith(':') ? `{${segment.slice(1)}}` : segment)).join('/')}`;

/** Doplní do požadavků kolekce návaznost podle `CHAINS`. */
function chainRequests(collection, label, log) {
  const requests = [...itemsOf(collection.item)].filter((item) => item.request);
  for (const { method, path, uses, saves } of CHAINS) {
    const item = requests.find(({ request }) => request.method.toLowerCase() === method && specPath(request.url) === path);
    if (!item) continue;
    if (uses) {
      const list = uses.in === 'query' ? item.request.url.query : item.request.url.variable;
      const parameter = list?.find(({ key }) => key === uses.name);
      if (parameter) {
        parameter.value = `{{${uses.name}}}`;
        parameter.disabled = false;
      } else {
        log.warn(
          `${label}: kolekce pro Postman: operace ${method.toUpperCase()} ${path} nemá parametr ${uses.name} (${uses.in}), který kolekce doplňuje z předchozího požadavku; uprav návaznost v scripts/postman.mjs`,
        );
      }
    }
    if (saves) item.event = [...(item.event ?? []), saveScript(saves)];
  }
}

/**
 * Identifikátor kolekce ve tvaru UUID odvozený z `name`: stejný při každém
 * buildu, takže Postman při importu nové verze nabídne nahrazení té staré.
 */
function stableId(name) {
  const hex = createHash('sha1').update(name).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Parametry požadavku na token, jejichž hodnotu vyplňuje vývojář u sebe. */
const CREDENTIALS = ['client_id', 'client_secret', 'username', 'password', 'refresh_token'];
/** Hodnota, která je jen proměnná Postmanu (`{{clientId}}`). */
const POSTMAN_VARIABLE = /^\{\{[^{}]+\}\}$/;

/**
 * Vyplněné přihlašovací údaje v kolekci (ZADANI část 13 a 17): parametr
 * požadavku s přihlašovacím údajem, jehož hodnota není proměnná Postmanu,
 * a neprázdná proměnná kolekce s přihlašovacím údajem nebo tokenem.
 * @returns {{location: string, problem: string}[]}
 */
export function filledCredentials(collection) {
  const found = (collection.variable ?? [])
    .filter(({ key, value }) => CREDENTIAL_VARIABLES.includes(key) && value)
    .map(({ key, value }) => ({ location: `variable › ${key}`, problem: `proměnná ${key} má hodnotu „${value}“, v kolekci musí být prázdná` }));
  const visit = (items, location) =>
    items.forEach((item, index) => {
      const here = [...location, index];
      if (item.item) visit(item.item, [...here, 'item']);
      const { body, url } = item.request ?? {};
      const parameters = [
        ...(body?.urlencoded ?? []).map((parameter, at) => ({ parameter, where: ['request', 'body', 'urlencoded', at] })),
        ...(body?.formdata ?? []).map((parameter, at) => ({ parameter, where: ['request', 'body', 'formdata', at] })),
        ...(typeof url === 'object' ? (url.query ?? []) : []).map((parameter, at) => ({ parameter, where: ['request', 'url', 'query', at] })),
      ];
      for (const { parameter, where } of parameters) {
        if (!CREDENTIALS.includes(parameter.key) || POSTMAN_VARIABLE.test(parameter.value ?? '')) continue;
        found.push({
          location: [...here, ...where].join(' › '),
          problem: `${item.name}: ${parameter.key} má hodnotu „${parameter.value}“, smí tam být jen proměnná Postmanu, například {{${parameter.key.replace(/_(\w)/g, (match, letter) => letter.toUpperCase())}}}`,
        });
      }
    });
  visit(collection.item ?? [], ['item']);
  return found;
}

/** Položky kolekce včetně složek, do hloubky. */
function* itemsOf(items) {
  for (const item of items) {
    yield item;
    if (item.item) yield* itemsOf(item.item);
  }
}

/**
 * Kolekce pro Postman z výsledné specifikace jednoho jazyka a prostředí.
 * Začíná složkou s požadavky na token, za ní jsou složky podle skupin se
 * zobrazovanými názvy a všechny ostatní požadavky dědí Bearer autentizaci
 * s proměnnou `accessToken`.
 * @param {object} options
 * @param {object} options.spec výsledná specifikace; zůstane beze změny
 * @param {{slug: string, baseUrl: string, tokenUrl: string}} options.environment prostředí specifikace
 * @param {{where: string, folder: object}} options.auth složka s požadavky na token (`readPostmanAuth`)
 * @param {string} options.language jazyk verze
 * @param {string[]} options.languages kódy všech jazyků webu
 * @param {string} options.label označení jazykové verze prostředí pro hlášení
 * @param {{warn: (message: string) => void}} options.log
 * @param {string} options.pageUrl úplná adresa stránky jazykové verze, na kterou vedou odkazy z textů
 * @param {Record<string, string>} options.alertLabels označení upozornění podle druhu (`WARNING` → „Upozornění“)
 * @returns {Promise<object>}
 */
export async function postmanCollection({ spec, environment, auth, language, languages, label, pageUrl, alertLabels, log }) {
  const collection = await convert(preferJson(textsForPostman(spec, pageUrl, alertLabels)), label);
  collection.info._postman_id = stableId(`dropshipping-api-docs/${language}/${environment.slug}`);
  // Převodník dává položkám a ukázkám náhodná ID; Postman si je při importu přidělí sám.
  for (const item of itemsOf(collection.item)) {
    delete item.id;
    delete item.request?.auth;
    for (const response of item.response ?? []) delete response.id;
  }
  // Převodník pojmenuje složky technickým názvem skupiny; na webu má skupina zobrazovaný.
  const displayNames = new Map((spec.tags ?? []).filter((tag) => tag['x-displayName']).map((tag) => [tag.name, tag['x-displayName']]));
  for (const folder of collection.item) if (folder.item && displayNames.has(folder.name)) folder.name = displayNames.get(folder.name);
  chainRequests(collection, label, log);
  collection.auth = BEARER_AUTH;
  collection.variable = variables(environment);
  collection.item.unshift(localized(auth.folder, language, languages, auth.where));
  return collection;
}

// Anglická verze řetězců ze specifikace (ZADANI část 16). Zdrojová specifikace
// i doplňky z overlay jsou česky; anglický build je překládá podle slovníku
// i18n/en.json, kde klíčem je český řetězec a hodnotou anglický překlad.
//
// Páruje se podle znění, ne podle místa ve specifikaci: stejný řetězec má
// všude stejný překlad a překlad přežije přesun operace nebo schématu. Nový
// nebo změněný řetězec ve specifikaci zůstane česky a build ho vypíše jako
// nepřeložený, nespadne.
//
// Překládají se názvy operací (`summary`), popisy (`description`: parametry,
// vlastnosti schémat, odpovědi, schémata zabezpečení) a zobrazované názvy
// skupin (`x-displayName`). Příklady (`example` a hodnota příkladu v `examples`),
// výchozí hodnoty a výčty jsou data API a zůstávají beze změny. Konce řádků z Windows se před párováním sjednotí,
// takže klíč ve slovníku má jen `\n`.
//
// Klíč i překlad smějí obsahovat zástupné symboly prostředí (`{{tokenUrl}}`)
// tak, jak jsou v overlay; v každém prostředí dostanou jeho hodnotu.

import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { environmentValues } from './environments.mjs';
import { fillPlaceholders } from './placeholders.mjs';

/** Klíče, jejichž řetězce jsou text pro čtenáře. */
const TEXT_KEYS = new Set(['summary', 'description', 'x-displayName']);

/** Klíče, pod kterými leží data API (ukázky, výchozí hodnoty, výčty), ne text. */
const DATA_KEYS = new Set(['example', 'default', 'enum']);

/** Klíče příkladu v mapě `examples` s daty; jeho název (`summary`) a popis jsou text. */
const EXAMPLE_DATA_KEYS = new Set(['value', 'externalValue']);

/** Text s konci řádků `\n` místo konců z Windows. */
const unixLineEndings = (text) => text.replace(/\r\n?/g, '\n');

/**
 * Načte soubor s překlady (JSON objekt). Neplatný JSON nebo jiná hodnota než
 * objekt je chyba; hlášení začíná cestou souboru, například `i18n/en.json`.
 * @returns {Promise<{where: string, content: object}>}
 */
async function readTranslationFile(path, expected) {
  const where = `${basename(dirname(path))}/${basename(path)}`;
  let content;
  try {
    content = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${where}: ${error.message}`, { cause: error });
  }
  if (typeof content !== 'object' || content === null || Array.isArray(content)) throw new Error(`${where}: soubor musí být objekt ${expected}`);
  return { where, content };
}

/**
 * Načte překlad rozhraní Scalaru: stejně vnořený objekt jako anglické texty
 * Scalaru. Řetězec, který v něm chybí, Scalar ukáže anglicky.
 */
export const readScalarTranslations = async (path) => (await readTranslationFile(path, '{ "oblast": { "klíč": "překlad" } }')).content;

/**
 * Načte slovník překladů. Každý překlad musí být neprázdný řetězec; jiná
 * hodnota je chyba, aby se do webu nedostal prázdný název nebo popis.
 * @returns {Promise<{where: string, entries: [string, string][]}>}
 */
export async function readDictionary(path) {
  const { where, content } = await readTranslationFile(path, '{ "český řetězec": "překlad" }');
  const invalid = Object.entries(content).filter(([, value]) => typeof value !== 'string' || value.trim() === '');
  if (invalid.length > 0) {
    throw new Error(`${where}: překlad musí být neprázdný řetězec:\n  ${invalid.map(([key]) => JSON.stringify(key)).join('\n  ')}`);
  }
  return { where, entries: Object.entries(content).map(([key, value]) => [unixLineEndings(key), unixLineEndings(value)]) };
}

/** Kde ve specifikaci řetězec leží, pro hlášení: `paths › /Info › get › summary`. */
const describeLocation = (path) => path.join(' › ');

/**
 * Přeloží řetězce specifikace jednoho prostředí.
 * @param {object} spec
 * @param {Map<string, string>} dictionary český řetězec → překlad, se zástupnými symboly už vyplněnými
 * @returns {{spec: object, untranslated: Map<string, string>, used: Set<string>}}
 *   nová specifikace; nepřeložené řetězce s místem prvního výskytu; použité klíče slovníku
 */
function translateSpec(spec, dictionary) {
  const untranslated = new Map();
  const used = new Set();
  const visit = (value, path) => {
    if (typeof value === 'string') {
      if (!TEXT_KEYS.has(path.at(-1))) return value;
      const text = unixLineEndings(value);
      if (dictionary.has(text)) {
        used.add(text);
        return dictionary.get(text);
      }
      if (!untranslated.has(text)) untranslated.set(text, describeLocation(path));
      return value;
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...path, String(index)]));
    if (typeof value !== 'object' || value === null) return value;
    // Ve `properties` jsou klíče názvy vlastností, takže vlastnost `default` je schéma, ne data.
    const isData = (key) =>
      path.at(-1) === 'properties' ? false : DATA_KEYS.has(key) || (path.at(-2) === 'examples' && EXAMPLE_DATA_KEYS.has(key));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isData(key) ? item : visit(item, [...path, key])]));
  };
  return { spec: visit(spec, []), untranslated, used };
}

/**
 * Přeloží specifikace všech prostředí podle slovníku.
 *
 * @param {object} options
 * @param {Map<string, object>} options.specs specifikace podle `slug` prostředí, po doplňcích z overlay
 * @param {{slug: string, baseUrl: string, tokenUrl: string}[]} options.environments
 * @param {{where: string, entries: [string, string][]}} options.dictionary slovník z `readDictionary`
 * @returns {{specs: Map<string, object>, untranslated: {text: string, location: string, environments: string[]}[], unused: string[]}}
 *   nové specifikace; nepřeložené řetězce (každý jednou, s místem prvního
 *   výskytu a prostředími, kde je); klíče slovníku, které nesedí na nic
 *   v žádném prostředí
 */
export function translateSpecs({ specs, environments, dictionary }) {
  const result = new Map();
  /** @type {Map<string, {text: string, location: string, environments: string[]}>} */
  const untranslated = new Map();
  const usedKeys = new Set();
  for (const environment of environments) {
    const values = environmentValues(environment);
    // Klíč se zástupným symbolem sedí na řetězec s hodnotou prostředí.
    const filled = dictionary.entries.map(([key, value]) => ({
      key,
      text: fillPlaceholders(key, values, dictionary.where),
      translation: fillPlaceholders(value, values, dictionary.where),
    }));
    const translated = translateSpec(specs.get(environment.slug), new Map(filled.map(({ text, translation }) => [text, translation])));
    for (const { key, text } of filled) if (translated.used.has(text)) usedKeys.add(key);
    for (const [text, location] of translated.untranslated) {
      if (!untranslated.has(text)) untranslated.set(text, { text, location, environments: [] });
      untranslated.get(text).environments.push(environment.slug);
    }
    result.set(environment.slug, translated.spec);
  }
  return {
    specs: result,
    untranslated: [...untranslated.values()],
    unused: dictionary.entries.map(([key]) => key).filter((key) => !usedKeys.has(key)),
  };
}

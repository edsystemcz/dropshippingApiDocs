// Sestaví web ze zdrojových specifikací a overlay: pro každý jazyk a každé
// prostředí zapíše specifikaci a stránku se Scalarem do dist/ (docs/adr/0001, 0004).

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { insertTexts, missingCounterparts, readTexts } from './content.mjs';
import { environmentLabel, versionLabel } from './environments.mjs';
import { mapStrings, operations } from './openapi.mjs';
import { applyOverlays, readOverlays } from './overlay.mjs';
import { fillPlaceholders } from './placeholders.mjs';
import { buildNumber, sourceSpecPath } from './source-spec.mjs';
import { readDictionary, readScalarTranslations, translateSpecs } from './translations.mjs';

/**
 * Titulek je název prostředí; číslo buildu API se z původního titulku stěhuje
 * do verze. Když v titulku není, zůstane verze ze zdroje a build jen varuje.
 */
function specForEnvironment(source, environment, apiBuild, log) {
  if (!apiBuild) {
    log.warn(`${environmentLabel(environment.slug)}: číslo buildu se z titulku nepodařilo vyčíst, verze zůstává ${source.info.version}`);
  }
  return { ...source, info: { ...source.info, title: environment.title, version: apiBuild ?? source.info.version } };
}

/**
 * Výsledná specifikace musí projít validací OpenAPI ve verzi, kterou uvádí
 * (zdroj je 3.0.1). Validátor ověří i to, že každý `$ref` někam vede.
 */
async function assertValidOpenApi(validator, spec, label) {
  const { valid, errors } = await validator.validate(spec);
  if (valid) return;
  // Odkaz, který nikam nevede, hlásí validátor jedním řetězcem, ostatní chyby polem.
  const details = typeof errors === 'string' ? [errors] : errors.map(({ instancePath, message }) => `${instancePath || '/'}: ${message}`);
  throw new Error(`${label}: výsledná specifikace neprošla validací OpenAPI ${spec.openapi}:\n  ${[...new Set(details)].slice(0, 10).join('\n  ')}`);
}

/**
 * Zdrojová specifikace má v textech konce řádků z Windows; výstup je má
 * jednotné, ať text přišel odkudkoli.
 */
const withUnixLineEndings = (spec) => mapStrings(spec, (text) => text.replace(/\r\n?/g, '\n'));

/**
 * Vypíše, kolik operací a skupin má text, a jako varování ty, které ho nemají:
 * skupiny na jednom řádku, operace po skupinách v pořadí menu.
 * @param {import('./content.mjs').Coverage} coverage
 */
function reportCoverage(label, coverage, log) {
  const groups = coverage.filter(({ name }) => name !== null);
  const all = coverage.flatMap(({ operations: list }) => list);
  const count = (items) => `${items.filter(({ described }) => described).length} z ${items.length}`;
  log.info(`${label}: popsáno ${count(all)} operací a ${count(groups)} skupin`);
  const groupsWithoutText = groups.filter(({ described }) => !described);
  if (groupsWithoutText.length > 0) log.warn(`${label}: skupiny bez textu: ${groupsWithoutText.map(({ name }) => name).join(', ')}`);
  const lines = coverage.flatMap(({ name, operations: list }) => {
    const withoutText = list.filter(({ described }) => !described);
    return withoutText.length > 0 ? [`  ${name ?? '(bez skupiny)'}`, ...withoutText.map(({ label: operation }) => `    ${operation}`)] : [];
  });
  if (lines.length > 0) log.warn([`${label}: operace bez textu:`, ...lines].join('\n'));
}

/** Vypíše jako varování texty, které v druhém jazyce nemají protějšek. */
function reportCounterparts(withoutCounterpart, log) {
  if (withoutCounterpart.length === 0) return;
  log.warn(
    [
      `Texty bez protějšku v druhém jazyce (${withoutCounterpart.length}); v druhém jazyce se nezobrazí:`,
      ...withoutCounterpart.map(({ text, missing }) => `  ${text.where}: chybí ${missing}`),
    ].join('\n'),
  );
}

/**
 * Vypíše řetězce ze specifikace, které slovník nepřekládá, jako varování
 * s úplným seznamem: klíč, jak ho zapsat do slovníku, a kde řetězec leží.
 * Překlady, které na nic nesedí (řetězec se ve specifikaci změnil nebo
 * zmizel), jen oznámí.
 */
function reportTranslations(language, where, { untranslated, unused }, environments, log) {
  if (untranslated.length > 0) {
    const lines = untranslated.map(({ text, location, environments: foundIn }) => {
      const onlyIn = foundIn.length < environments.length ? `, jen ${foundIn.map(environmentLabel).join(', ')}` : '';
      return `  ${JSON.stringify(text)}  (${location}${onlyIn})`;
    });
    log.warn([`${language}: nepřeložené řetězce ze specifikace (${untranslated.length}), zůstaly česky; doplňte je do ${where}:`, ...lines].join('\n'));
  }
  if (unused.length > 0) {
    log.info([`${language}: překlady v ${where}, které ve specifikaci nic nepřekládají:`, ...unused.map((key) => `  ${JSON.stringify(key)}`)].join('\n'));
  }
}

/** Název specifikace prostředí ve výstupu; stránka na ni odkazuje relativně. */
const specFileName = (slug) => `openapi.${slug}.json`;

/**
 * Jazykové verze webu: čeština v kořeni výstupu, angličtina ve složce en/.
 * `rootPath` je cesta ze stránky ke kořeni výstupu, kde leží společné soubory.
 * `label` je zkratka v přepínači jazyka, `switchLabel` jeho popisek pro čtečky.
 */
const LANGUAGES = [
  // Češtinu Scalar vestavěnou nemá; rozhraní dostane překlad ze slovníku.
  { code: 'cs', label: 'CZ', dir: '', rootPath: '', pageTitle: 'Dropshipping API dokumentace | eD system', switchLabel: 'Jazyk', scalarTranslations: 'scalar.cs.json' },
  // Specifikace je česky; anglická verze ji překládá podle slovníku.
  { code: 'en', label: 'EN', dir: 'en', rootPath: '../', pageTitle: 'Dropshipping API documentation | eD system', switchLabel: 'Language', dictionary: 'en.json' },
];

/**
 * Přepínač jazyka do záhlaví: zvolený jazyk jako aktuální, ostatní jako
 * relativní odkaz na jejich verzi. Odkazy nesou `data-language-switch`;
 * skript stránky k nim před přechodem doplní místo v referenci a prostředí.
 */
const languageSwitch = (current) => {
  const items = LANGUAGES.map((language) => {
    if (language === current) return `<span lang="${language.code}" aria-current="true">${language.label}</span>`;
    const href = `${current.rootPath}${language.dir ? `${language.dir}/` : ''}` || './';
    return `<a href="${href}" hreflang="${language.code}" lang="${language.code}" data-language-switch>${language.label}</a>`;
  });
  return `<nav class="site-languages" aria-label="${current.switchLabel}">${items.join(' <span aria-hidden="true">|</span> ')}</nav>`;
};

/** JSON pro vložení do <script>: znak < se zapíše únikově, aby text nemohl značku ukončit. */
const scriptJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

/** Prostředí pro přepínač Scalaru. */
const scalarSources = (environments) =>
  environments.map(({ title, slug, default: isDefault }) => ({
    title,
    slug,
    url: specFileName(slug),
    default: Boolean(isDefault),
  }));

/**
 * Logo pro vložení do stránky jako inline SVG: přes <img> by text loga
 * s `fill:currentColor` barvu stránky nepřevzal. Deklarace XML, typ dokumentu
 * a jmenné prostory z grafického editoru HTML nepotřebuje; adresy jmenných
 * prostorů by navíc vypadaly jako odkazy na cizí domény.
 */
const inlineSvg = (svg) =>
  svg
    .replace(/^\s*<\?xml[^>]*\?>\s*/, '')
    .replace(/^<!DOCTYPE[^>]*>\s*/i, '')
    .replace(/\s+xmlns(?::[\w-]+)?="[^"]*"/g, '')
    .trim();

/** Kam build zapíše motiv. */
const THEME_FILE = 'assets/theme.css';

/**
 * Výstup vzniká celý znovu: obsahuje jen specifikace, stránky, soubory
 * vyjmenované v `assets` a motiv, nic z minulého buildu ani nic dalšího
 * ze zdrojů.
 *
 * Specifikace prostředí vzniká ze zdrojové specifikace, doplňků z overlay
 * (scripts/overlay.mjs) a textů v jazyce verze (scripts/content.mjs) a musí
 * projít validací OpenAPI. Anglická verze má řetězce ze specifikace a overlay
 * přeložené podle slovníku (scripts/translations.mjs). Chyba v doplňcích,
 * v textech, ve slovníku nebo ve validaci shodí build dřív, než se sáhne na výstup.
 *
 * Jako varování build vypíše nepřeložené řetězce a texty bez protějšku
 * v druhém jazyce; takový text se v druhém jazyce nezobrazí.
 *
 * Na konci build vypíše pro každý jazyk a prostředí pokrytí: kolik operací
 * a skupin má text, a jako varování ty, které ho nemají.
 *
 * Šablona stránky `index.html` v `siteDir` smí obsahovat tyto zástupné symboly:
 * `{{lang}}` (jazyk verze), `{{pageTitle}}` (titulek stránky), `{{rootPath}}`
 * (cesta ke společným souborům), `{{sources}}` (prostředí pro přepínač Scalaru),
 * `{{logo}}` (logo jako inline SVG), `{{themeStyles}}` (odkaz na motiv,
 * nebo nic), `{{localization}}` (jazyk a překlad rozhraní pro volbu
 * `localization` Scalaru) a `{{languageSwitch}}` (přepínač jazyka CZ | EN).
 *
 * Motiv je nepovinný: když ho build dostane, zkopíruje ho do `assets/theme.css`
 * a stránky na něj odkazují. Bez něj má web výchozí vzhled Scalaru.
 *
 * @param {object} options
 * @param {{slug: string, title: string, default?: boolean, baseUrl: string, tokenUrl: string, notice?: Record<string, string>}[]} options.environments
 *   `notice` je upozornění prostředí se zněním pro každý jazyk
 * @param {string} options.specDir složka se zdrojovými specifikacemi
 * @param {string} options.overlayDir složka s doplňky (`*.json`)
 * @param {string} options.contentDir složka s texty, pro každý jazyk jedna podsložka
 * @param {string} options.siteDir složka se šablonou stránky
 * @param {string} options.i18nDir složka s překlady: `en.json` (řetězce ze specifikace
 *   pro anglickou verzi) a `scalar.cs.json` (rozhraní Scalaru pro českou verzi)
 * @param {string} options.outDir výstupní složka; build ji před zápisem smaže
 * @param {{from: string, to: string}[]} options.assets společné soubory: odkud a kam ve výstupu
 * @param {string} options.logo soubor s logem (SVG)
 * @param {string} [options.theme] soubor s motivem (CSS)
 * @param {{info: (message: string) => void, warn: (message: string) => void}} [options.log]
 */
export async function build({ environments, specDir, overlayDir, contentDir, siteDir, i18nDir, outDir, assets, logo: logoPath, theme: themePath, log = console }) {
  const template = await readFile(join(siteDir, 'index.html'), 'utf8');
  const logo = inlineSvg(await readFile(logoPath, 'utf8'));
  const theme = themePath === undefined ? null : await readFile(themePath);
  const sources = scriptJson(scalarSources(environments));
  const overlays = await readOverlays(overlayDir);
  const titled = new Map();
  const apiBuilds = new Map();
  for (const environment of environments) {
    const source = JSON.parse(await readFile(sourceSpecPath(specDir, environment.slug), 'utf8'));
    apiBuilds.set(environment.slug, buildNumber(source));
    titled.set(environment.slug, specForEnvironment(source, environment, apiBuilds.get(environment.slug), log));
  }
  const specs = applyOverlays({ specs: titled, environments, overlays, log });
  for (const [slug, spec] of specs) {
    // Počítá se výsledná specifikace: na webu jsou i operace doplněné z overlay.
    const apiBuild = apiBuilds.get(slug);
    log.info(`${environmentLabel(slug)}: ${apiBuild ? `build ${apiBuild}, ` : ''}operací: ${[...operations(spec)].length}`);
  }
  const validator = new Validator();
  const files = new Map();
  /** Pokrytí texty podle označení jazykové verze prostředí. */
  const coverages = new Map();
  const textsByLanguage = new Map();
  for (const { code } of LANGUAGES) textsByLanguage.set(code, await readTexts(contentDir, code));
  reportCounterparts(missingCounterparts(contentDir, textsByLanguage), log);
  for (const language of LANGUAGES) {
    const texts = textsByLanguage.get(language.code);
    let languageSpecs = specs;
    if (language.dictionary) {
      const dictionary = await readDictionary(join(i18nDir, language.dictionary));
      const translated = translateSpecs({ specs, environments, dictionary });
      languageSpecs = translated.specs;
      reportTranslations(language.code, dictionary.where, translated, environments, log);
    }
    const inserted = insertTexts({ specs: languageSpecs, environments, texts, language: language.code, log });
    for (const [slug, withTexts] of inserted.specs) {
      const label = versionLabel(language.code, slug);
      const spec = withUnixLineEndings(withTexts);
      await assertValidOpenApi(validator, spec, label);
      files.set(join(language.dir, specFileName(slug)), JSON.stringify(spec, null, 2));
      coverages.set(label, inserted.coverage.get(slug));
    }
  }
  if (theme !== null) files.set(THEME_FILE, theme);
  for (const language of LANGUAGES) {
    const { code, dir, rootPath, pageTitle, scalarTranslations } = language;
    const themeStyles = theme === null ? '' : `<link rel="stylesheet" href="${rootPath}${THEME_FILE}">`;
    const localization = scriptJson(scalarTranslations ? { locale: code, translations: await readScalarTranslations(join(i18nDir, scalarTranslations)) } : { locale: code });
    const values = { lang: code, pageTitle, rootPath, sources, logo, themeStyles, localization, languageSwitch: languageSwitch(language) };
    files.set(join(dir, 'index.html'), fillPlaceholders(template, values, 'šablona stránky'));
  }
  for (const { from, to } of assets) files.set(to, await readFile(from));

  // Vše je načtené; teprve teď se sahá na výstup, aby chyba ve vstupech
  // nenechala web z minulého buildu smazaný nebo napůl přepsaný.
  await rm(outDir, { recursive: true, force: true });
  for (const [path, content] of files) {
    await mkdir(dirname(join(outDir, path)), { recursive: true });
    await writeFile(join(outDir, path), content);
  }
  log.info(`Web sestaven: ${files.size} souborů ve složce ${outDir}`);
  // Pokrytí až na konec: je to seznam zbývající práce a ve výpisu má být vidět.
  for (const [label, coverage] of coverages) reportCoverage(label, coverage, log);
}

/**
 * Společné soubory webu. Scalar a písma jsou zafixované závislosti a build je
 * kopíruje do webu, aby stránka nenačítala nic z cizích domén (docs/adr/0002).
 * Co tu ani v `siteInputs` není vyjmenované, se na web nedostane.
 */
const siteAssets = (repoRoot) => {
  const inter = join(repoRoot, 'node_modules/@fontsource-variable/inter');
  const mono = join(repoRoot, 'node_modules/@fontsource-variable/jetbrains-mono');
  return [
    { from: join(repoRoot, 'node_modules/@scalar/api-reference/dist/browser/standalone.js'), to: 'assets/scalar/standalone.js' },
    { from: join(repoRoot, 'site/assets/favicon.svg'), to: 'assets/favicon.svg' },
    { from: join(repoRoot, 'site/site.css'), to: 'assets/site.css' },
    { from: join(repoRoot, 'site/fonts.css'), to: 'assets/fonts/fonts.css' },
    // Vlastní výřez Interu se symboly kláves, viz site/fonts.css.
    { from: join(repoRoot, 'site/assets/inter-symbols.woff2'), to: 'assets/fonts/inter-symbols.woff2' },
    ...['latin', 'latin-ext'].flatMap((subset) => [
      { from: join(inter, `files/inter-${subset}-wght-normal.woff2`), to: `assets/fonts/inter-${subset}-wght-normal.woff2` },
      { from: join(inter, `files/inter-${subset}-wght-italic.woff2`), to: `assets/fonts/inter-${subset}-wght-italic.woff2` },
      { from: join(mono, `files/jetbrains-mono-${subset}-wght-normal.woff2`), to: `assets/fonts/jetbrains-mono-${subset}-wght-normal.woff2` },
    ]),
    // Licence OFL musí písma provázet.
    { from: join(inter, 'LICENSE'), to: 'assets/fonts/LICENSE-inter.txt' },
    { from: join(mono, 'LICENSE'), to: 'assets/fonts/LICENSE-jetbrains-mono.txt' },
  ];
};

/**
 * Vstupy buildu pro toto repo; výstupní složku určuje volající.
 * Motiv site/theme.css je pokus (ZADANI část 12): když soubor smažeš, web
 * dostane výchozí vzhled Scalaru.
 */
export const siteInputs = async (repoRoot) => {
  const theme = join(repoRoot, 'site/theme.css');
  return {
    environments: JSON.parse(await readFile(join(repoRoot, 'environments.json'), 'utf8')),
    specDir: join(repoRoot, 'spec'),
    overlayDir: join(repoRoot, 'overlay'),
    contentDir: join(repoRoot, 'content'),
    siteDir: join(repoRoot, 'site'),
    i18nDir: join(repoRoot, 'i18n'),
    assets: siteAssets(repoRoot),
    logo: join(repoRoot, 'site/assets/logo.svg'),
    ...(existsSync(theme) && { theme }),
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  await build({ ...(await siteInputs(repoRoot)), outDir: join(repoRoot, 'dist') });
}

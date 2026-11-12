// Sestaví web ze zdrojových specifikací a overlay: pro každý jazyk a každé
// prostředí zapíše specifikaci a stránku se Scalarem do dist/ (docs/adr/0001, 0004).

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { insertTexts, readTexts } from './content.mjs';
import { environmentLabel, versionLabel } from './environments.mjs';
import { mapStrings, operations } from './openapi.mjs';
import { applyOverlays, readOverlays } from './overlay.mjs';
import { fillPlaceholders } from './placeholders.mjs';
import { buildNumber, sourceSpecPath } from './source-spec.mjs';

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

/** Název specifikace prostředí ve výstupu; stránka na ni odkazuje relativně. */
const specFileName = (slug) => `openapi.${slug}.json`;

/**
 * Jazykové verze webu: čeština v kořeni výstupu, angličtina ve složce en/.
 * `rootPath` je cesta ze stránky ke kořeni výstupu, kde leží společné soubory.
 */
const LANGUAGES = [
  { code: 'cs', dir: '', rootPath: '', pageTitle: 'Dropshipping API dokumentace | eD system' },
  { code: 'en', dir: 'en', rootPath: '../', pageTitle: 'Dropshipping API documentation | eD system' },
];

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
 * Výstup vzniká celý znovu: obsahuje jen specifikace, stránky a soubory
 * vyjmenované v `assets`, nic z minulého buildu ani nic dalšího ze zdrojů.
 *
 * Specifikace prostředí vzniká ze zdrojové specifikace, doplňků z overlay
 * (scripts/overlay.mjs) a textů v jazyce verze (scripts/content.mjs) a musí
 * projít validací OpenAPI. Chyba v doplňcích, v textech nebo ve validaci
 * shodí build dřív, než se sáhne na výstup.
 *
 * Na konci build vypíše pro každý jazyk a prostředí pokrytí: kolik operací
 * a skupin má text, a jako varování ty, které ho nemají.
 *
 * Šablona stránky `index.html` v `siteDir` smí obsahovat tyto zástupné symboly:
 * `{{lang}}` (jazyk verze), `{{pageTitle}}` (titulek stránky), `{{rootPath}}`
 * (cesta ke společným souborům) a `{{sources}}` (prostředí pro přepínač Scalaru).
 *
 * @param {object} options
 * @param {{slug: string, title: string, default?: boolean, baseUrl: string, tokenUrl: string, notice?: Record<string, string>}[]} options.environments
 *   `notice` je upozornění prostředí se zněním pro každý jazyk
 * @param {string} options.specDir složka se zdrojovými specifikacemi
 * @param {string} options.overlayDir složka s doplňky (`*.json`)
 * @param {string} options.contentDir složka s texty, pro každý jazyk jedna podsložka
 * @param {string} options.siteDir složka se šablonou stránky
 * @param {string} options.outDir výstupní složka; build ji před zápisem smaže
 * @param {{from: string, to: string}[]} options.assets společné soubory: odkud a kam ve výstupu
 * @param {{info: (message: string) => void, warn: (message: string) => void}} [options.log]
 */
export async function build({ environments, specDir, overlayDir, contentDir, siteDir, outDir, assets, log = console }) {
  const template = await readFile(join(siteDir, 'index.html'), 'utf8');
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
  for (const language of LANGUAGES) {
    const texts = await readTexts(contentDir, language.code);
    const inserted = insertTexts({ specs, environments, texts, language: language.code, log });
    for (const [slug, withTexts] of inserted.specs) {
      const label = versionLabel(language.code, slug);
      const spec = withUnixLineEndings(withTexts);
      await assertValidOpenApi(validator, spec, label);
      files.set(join(language.dir, specFileName(slug)), JSON.stringify(spec, null, 2));
      coverages.set(label, inserted.coverage.get(slug));
    }
  }
  for (const { code, dir, rootPath, pageTitle } of LANGUAGES) {
    files.set(join(dir, 'index.html'), fillPlaceholders(template, { lang: code, pageTitle, rootPath, sources }, 'šablona stránky'));
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
 * Co tu není vyjmenované, se na web nedostane.
 */
const siteAssets = (repoRoot) => {
  const inter = join(repoRoot, 'node_modules/@fontsource-variable/inter');
  const mono = join(repoRoot, 'node_modules/@fontsource-variable/jetbrains-mono');
  return [
    { from: join(repoRoot, 'node_modules/@scalar/api-reference/dist/browser/standalone.js'), to: 'assets/scalar/standalone.js' },
    { from: join(repoRoot, 'site/assets/favicon.svg'), to: 'assets/favicon.svg' },
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

/** Vstupy buildu pro toto repo; výstupní složku určuje volající. */
export const siteInputs = async (repoRoot) => ({
  environments: JSON.parse(await readFile(join(repoRoot, 'environments.json'), 'utf8')),
  specDir: join(repoRoot, 'spec'),
  overlayDir: join(repoRoot, 'overlay'),
  contentDir: join(repoRoot, 'content'),
  siteDir: join(repoRoot, 'site'),
  assets: siteAssets(repoRoot),
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  await build({ ...(await siteInputs(repoRoot)), outDir: join(repoRoot, 'dist') });
}

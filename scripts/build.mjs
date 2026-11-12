// Sestaví web ze zdrojových specifikací: pro každý jazyk a každé prostředí
// zapíše specifikaci a stránku se Scalarem do dist/ (docs/adr/0001, 0004).

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNumber, sourceSpecPath } from './source-spec.mjs';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** Operace je kombinace metody a cesty; ostatní klíče cesty (parameters, summary) se nepočítají. */
const countOperations = (spec) =>
  Object.values(spec.paths).reduce((count, path) => count + HTTP_METHODS.filter((method) => method in path).length, 0);

/**
 * Titulek je název prostředí; číslo buildu API se z původního titulku stěhuje
 * do verze. Když v titulku není, zůstane verze ze zdroje a build jen varuje.
 */
function specForEnvironment(source, environment, log) {
  const label = environment.slug.toUpperCase();
  const apiBuild = buildNumber(source);
  if (apiBuild) {
    log.info(`${label}: build ${apiBuild}, operací: ${countOperations(source)}`);
  } else {
    log.warn(`${label}: číslo buildu se z titulku nepodařilo vyčíst, verze zůstává ${source.info.version}`);
  }
  return { ...source, info: { ...source.info, title: environment.title, version: apiBuild ?? source.info.version } };
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

/** Vyplní zástupné symboly {{název}} v šabloně stránky; neznámý symbol je chyba. */
const fillTemplate = (template, values) =>
  template.replace(/\{\{(\w+)\}\}/g, (symbol, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`šablona stránky obsahuje neznámý zástupný symbol ${symbol}`);
    return values[name];
  });

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
 * Šablona stránky `index.html` v `siteDir` smí obsahovat tyto zástupné symboly:
 * `{{lang}}` (jazyk verze), `{{pageTitle}}` (titulek stránky), `{{rootPath}}`
 * (cesta ke společným souborům) a `{{sources}}` (prostředí pro přepínač Scalaru).
 *
 * @param {object} options
 * @param {{slug: string, title: string, default?: boolean}[]} options.environments
 * @param {string} options.specDir složka se zdrojovými specifikacemi
 * @param {string} options.siteDir složka se šablonou stránky
 * @param {string} options.outDir výstupní složka; build ji před zápisem smaže
 * @param {{from: string, to: string}[]} options.assets společné soubory: odkud a kam ve výstupu
 * @param {{info: (message: string) => void, warn: (message: string) => void}} [options.log]
 */
export async function build({ environments, specDir, siteDir, outDir, assets, log = console }) {
  const template = await readFile(join(siteDir, 'index.html'), 'utf8');
  const sources = scriptJson(scalarSources(environments));
  const files = new Map();
  for (const environment of environments) {
    const source = JSON.parse(await readFile(sourceSpecPath(specDir, environment.slug), 'utf8'));
    const spec = JSON.stringify(specForEnvironment(source, environment, log), null, 2);
    for (const language of LANGUAGES) files.set(join(language.dir, specFileName(environment.slug)), spec);
  }
  for (const { code, dir, rootPath, pageTitle } of LANGUAGES) {
    files.set(join(dir, 'index.html'), fillTemplate(template, { lang: code, pageTitle, rootPath, sources }));
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
  siteDir: join(repoRoot, 'site'),
  assets: siteAssets(repoRoot),
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  await build({ ...(await siteInputs(repoRoot)), outDir: join(repoRoot, 'dist') });
}

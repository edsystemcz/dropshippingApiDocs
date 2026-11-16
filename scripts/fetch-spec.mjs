// Stáhne zdrojovou specifikaci každého prostředí z environments.json do spec/
// a uloží ji jen tehdy, když se liší od uložené kopie (docs/adr/0001).
//
// Výpadek API ani neplatná odpověď nejsou chyba: uložená kopie zůstane,
// skript vypíše varování a skončí úspěšně, aby se web dal sestavit dál.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environmentLabel } from './environments.mjs';
import { specChanges } from './spec-changes.mjs';
import { buildNumber, sourceSpecPath } from './source-spec.mjs';
import { annotation, inWorkflow, runUrl, stepOutput } from './workflow-commands.mjs';

const TIMEOUT_MS = 30_000;

const readIfExists = (path) =>
  readFile(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Hrubá kontrola, že odpověď je specifikace OpenAPI 3, a ne třeba chybová
 * stránka. Úplnou validaci dělá až build nad obohacenou specifikací.
 */
function assertOpenApi(spec) {
  if (!isObject(spec)) throw new Error('odpověď není objekt JSON');
  if (typeof spec.openapi !== 'string' || !spec.openapi.startsWith('3.')) {
    throw new Error('chybí verze OpenAPI 3');
  }
  if (!isObject(spec.info)) throw new Error('chybí info');
  if (!isObject(spec.paths)) throw new Error('chybí paths');
}

/** Uložená kopie jako objekt, nebo `null`, když se nedá přečíst; pak není s čím novou specifikaci porovnat. */
function parseStored(stored) {
  try {
    const spec = JSON.parse(stored.toString('utf8'));
    assertOpenApi(spec);
    return spec;
  } catch {
    return null;
  }
}

/** Stáhne specifikaci; při výpadku nebo neplatné odpovědi vyhodí chybu s důvodem. */
async function download(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const spec = JSON.parse(body.toString('utf8'));
  assertOpenApi(spec);
  return { body, spec };
}

/**
 * @param {object} options
 * @param {{slug: string, specUrl: string}[]} options.environments
 * @param {string} options.specDir složka s uloženými kopiemi
 * @param {typeof fetch} [options.fetchImpl]
 * @param {{info: (message: string) => void, warn: (message: string) => void}} [options.log]
 * @returns {Promise<{slug: string, status: 'unchanged' | 'changed' | 'failed', build?: string | null, previousBuild?: string | null, changes?: ReturnType<typeof specChanges> | null}[]>}
 *   u změněné specifikace nové a předchozí číslo buildu a přehled změn; bez
 *   čitelné uložené kopie je `previousBuild` i `changes` `null`
 */
export async function fetchSpecs({ environments, specDir, fetchImpl = fetch, log = console }) {
  await mkdir(specDir, { recursive: true });
  const results = [];
  for (const { slug, specUrl } of environments) {
    const label = environmentLabel(slug);
    const path = sourceSpecPath(specDir, slug);

    let downloaded;
    try {
      downloaded = await download(specUrl, fetchImpl);
    } catch (error) {
      log.warn(`${label}: stažení selhalo (${error.message}), zůstává uložená kopie`);
      results.push({ slug, status: 'failed' });
      continue;
    }

    const stored = await readIfExists(path);
    if (stored?.equals(downloaded.body)) {
      log.info(`${label}: beze změny`);
      results.push({ slug, status: 'unchanged' });
      continue;
    }

    const build = buildNumber(downloaded.spec);
    await writeFile(path, downloaded.body);
    if (build) {
      log.info(`${label}: nová specifikace, build ${build}`);
    } else {
      log.warn(`${label}: nová specifikace, číslo buildu se z titulku nepodařilo vyčíst`);
    }
    const previous = stored && parseStored(stored);
    results.push({
      slug,
      status: 'changed',
      build,
      previousBuild: previous ? buildNumber(previous) : null,
      changes: previous ? specChanges(previous, downloaded.spec) : null,
    });
  }
  return results;
}

/** Nejvíc názvů v jednom výčtu těla zprávy commitu; zbytek se jen spočítá. */
const MAX_LISTED = 20;

/**
 * Názvy operací a schémat jsou text ze stažené specifikace: zpráva commitu je
 * zapíše na jeden řádek, i kdyby obsahovaly konec řádku.
 */
const onOneLine = (name) => name.replace(/[\p{Cc}\s]+/gu, ' ').trim();

function listNames(names) {
  const listed = names.slice(0, MAX_LISTED).map(onOneLine).join(', ');
  return names.length > MAX_LISTED ? `${listed} a další (${names.length - MAX_LISTED})` : listed;
}

/** Řádky těla zprávy commitu pro jedno změněné prostředí. */
function describeChange({ slug, build, previousBuild, changes }) {
  const label = environmentLabel(slug);
  // Bez čitelné uložené kopie není s čím porovnat.
  if (!changes) return [`${label}: první uložení${build ? `, build ${build}` : ''}`];
  const builds = build && build === previousBuild ? `build ${build}, číslo buildu se nezměnilo` : `build ${previousBuild ?? 'neznámý'} → ${build ?? 'neznámý'}`;
  const kinds = [
    ['přidané operace', changes.operations.added],
    ['odebrané operace', changes.operations.removed],
    ['změněné operace', changes.operations.changed],
    ['přidaná schémata', changes.schemas.added],
    ['odebraná schémata', changes.schemas.removed],
    ['změněná schémata', changes.schemas.changed],
  ];
  const lines = kinds.filter(([, names]) => names.length > 0).map(([kind, names]) => `- ${kind} (${names.length}): ${listNames(names)}`);
  if (lines.length === 0) lines.push('- operace ani schémata se nezměnily, změna je jinde ve specifikaci');
  return [`${label}: ${builds}`, ...lines];
}

/**
 * Zpráva commitu, kterým workflow uloží změněné specifikace (ZADANI část 11).
 * Předmět jmenuje prostředí a nové číslo buildu, tělo u každého prostředí
 * uvede předchozí build a co se ve specifikaci změnilo.
 *
 * @param {Awaited<ReturnType<typeof fetchSpecs>>} results
 * @param {object} [options]
 * @param {string} [options.runUrl] adresa běhu workflow, který specifikaci stáhl
 * @returns {string | null} `null`, když se žádná specifikace nezměnila
 */
export function commitMessage(results, { runUrl } = {}) {
  const changed = results.filter(({ status }) => status === 'changed');
  if (changed.length === 0) return null;
  // Prostředí se stejným buildem se uvedou společně: „PROD a TEST na build 1.1.123“.
  // Prostředí bez čísla buildu jdou na konec, aby se jim nepřičetl build prostředí před nimi.
  const byBuild = [...Map.groupBy(changed, ({ build }) => build)];
  const parts = [...byBuild.filter(([build]) => build), ...byBuild.filter(([build]) => !build)].map(([build, environments]) => {
    const labels = environments.map(({ slug }) => environmentLabel(slug)).join(' a ');
    return build ? `${labels} na build ${build}` : labels;
  });
  const subject = `chore(spec): aktualizace specifikace ${parts.join(' a ')}`;
  const paragraphs = [subject, ...changed.map((result) => describeChange(result).join('\n'))];
  if (runUrl) paragraphs.push(`Běh workflow: ${runUrl}`);
  return paragraphs.join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const environments = JSON.parse(await readFile(join(root, 'environments.json'), 'utf8'));
  // Ve workflow se varování ukáže i v přehledu běhu, ne jen ve výpisu kroku.
  const log = inWorkflow() ? { info: console.log, warn: (message) => console.log(annotation('warning', 'Specifikace', message)) } : console;
  const results = await fetchSpecs({ environments, specDir: join(root, 'spec'), log });
  // Workflow podle výstupu pozná, že má změněné specifikace commitnout, a s jakou zprávou.
  const message = commitMessage(results, { runUrl: runUrl() });
  if (message && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, stepOutput('commit-message', message));
}

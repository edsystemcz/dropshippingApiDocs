// Stáhne zdrojovou specifikaci každého prostředí z environments.json do spec/
// a uloží ji jen tehdy, když se liší od uložené kopie (docs/adr/0001).
//
// Výpadek API ani neplatná odpověď nejsou chyba: uložená kopie zůstane,
// skript vypíše varování a skončí úspěšně, aby se web dal sestavit dál.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environmentLabel } from './environments.mjs';
import { buildNumber, sourceSpecPath } from './source-spec.mjs';

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
 * @returns {Promise<{slug: string, status: 'unchanged' | 'changed' | 'failed', build?: string | null}[]>}
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
    results.push({ slug, status: 'changed', build });
  }
  return results;
}

/**
 * Zpráva commitu, kterým workflow uloží změněné specifikace (ZADANI.md, část 11):
 * jmenuje prostředí a nové číslo buildu.
 *
 * @param {Awaited<ReturnType<typeof fetchSpecs>>} results
 */
export function commitMessage(results) {
  const changed = results.filter(({ status }) => status === 'changed');
  if (changed.length === 0) return null;
  // Prostředí se stejným buildem se uvedou společně: „PROD a TEST na build 1.1.123“.
  // Prostředí bez čísla buildu jdou na konec, aby se jim nepřičetl build prostředí před nimi.
  const byBuild = [...Map.groupBy(changed, ({ build }) => build)];
  const parts = [...byBuild.filter(([build]) => build), ...byBuild.filter(([build]) => !build)].map(([build, environments]) => {
    const labels = environments.map(({ slug }) => environmentLabel(slug)).join(' a ');
    return build ? `${labels} na build ${build}` : labels;
  });
  return `chore(spec): aktualizace specifikace ${parts.join(' a ')}`;
}

/** Text varování musí být na jednom řádku, jinak by jeho další řádky runner četl jako příkazy workflow. */
const escapeAnnotation = (message) => message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const environments = JSON.parse(await readFile(join(root, 'environments.json'), 'utf8'));
  // Ve workflow se varování ukáže i v přehledu běhu, ne jen ve výpisu kroku.
  const log =
    process.env.GITHUB_ACTIONS === 'true'
      ? { info: console.log, warn: (message) => console.log(`::warning title=Specifikace::${escapeAnnotation(message)}`) }
      : console;
  const results = await fetchSpecs({ environments, specDir: join(root, 'spec'), log });
  // Workflow podle výstupu pozná, že má změněné specifikace commitnout, a s jakou zprávou.
  const message = commitMessage(results);
  if (message && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `commit-message=${message}\n`);
}

// Texty dokumentace: soubory Markdownu ze složky content/<jazyk>/ build vkládá
// do specifikace každého prostředí (docs/adr/0001, 0004).
//
//   intro/*.md                     kapitoly úvodu, řazené podle názvu souboru
//   tags/<skupina>.md              text skupiny; technický název skupiny
//                                  ze specifikace (Products), ne zobrazovaný
//   operations/<metoda>__<cesta>.md  popis operace; metoda malými písmeny, cesta
//                                  s podtržítky místo lomítek a s původní
//                                  velikostí písmen (get__codelists_ProductCategory.md)
//
// Kapitola úvodu začíná nadpisem první úrovně (`# Název`); Scalar z nadpisů
// dělá položky menu a text před prvním nadpisem by přidal položku navíc.
// Nadpisy úvodu se píší křížky a jsou prostý text bez formátování, jinak by
// k nim Scalar z menu nedoskočil nebo by odkaz na ně vedl jinam.
//
// Hodnoty, které se liší mezi prostředími, se píší zástupnými symboly
// (`{{baseUrl}}`, `{{tokenUrl}}`, `{{envSlug}}`), i uvnitř ukázek kódu.
//
// Odkaz na jiný text se píše jako odkaz na jeho soubor, volitelně s nadpisem
// za `#` tak, jak ho jako kotvu tvoří GitHub: `[průvodce](../intro/30-pruvodce.md#nadpis)`.
// Funguje tak i v náhledu na GitHubu a build ho převede na adresu ve Scalaru.
// Odkaz na nadpis v textu skupiny nebo operace vede na skupinu nebo operaci,
// jemněji Scalar spolehlivě necílí. Na skupinu nebo operaci, která text ještě
// nemá, se odkazuje stejně: souborem, ve kterém její text jednou bude
// (`../operations/post__b2c_orders.md`). Odkaz, který nikam nevede, shodí build.
//
// Soubor nebo složka s podtržítkem na začátku názvu (šablona popisu operace)
// se nečte, stejně jako skryté soubory s tečkou na začátku. Jiný soubor mimo
// tato tři místa shodí build, stejně jako osiřelý text: text skupiny nebo
// operace, která není v žádném prostředí.

import { readFile, readdir } from 'node:fs/promises';
import { basename, join, posix, relative, sep } from 'node:path';
import { environmentLabel, environmentValues, versionLabel } from './environments.mjs';
import { headings, linkDefinitions, mapLinks, underlinedHeadings } from './markdown.mjs';
import { operations } from './openapi.mjs';
import { fillPlaceholders } from './placeholders.mjs';
import { groupAddress, headingAddress, operationAddress, slugger, slugify } from './scalar-addresses.mjs';

/** Druhy textů; druh je název složky, ve které soubor leží. */
const KINDS = ['intro', 'tags', 'operations'];

/** Název souboru (bez přípony) s popisem operace. */
const operationTextName = (method, path) => `${method}_${path.replaceAll('/', '_')}`;

/** Cesta souboru s textem skupiny nebo operace ve složce jazyka. */
const textPath = (kind, name) => `${kind}/${name}.md`;

/** Nejčastější chyba v názvu souboru je velikost písmen; názvy se párují přesně. */
function caseHint(expectedNames, name) {
  const similar = [...expectedNames].find((expected) => expected.toLowerCase() === name.toLowerCase());
  return similar ? ` (liší se jen velikostí písmen od ${similar}.md)` : '';
}

/**
 * Text dokumentace načtený ze souboru.
 * @typedef {object} Text
 * @property {'intro' | 'tags' | 'operations'} kind
 * @property {string} name název souboru bez přípony
 * @property {string} path cesta ve složce jazyka, například `intro/10-uvod.md`
 * @property {string} where cesta pro hlášení, například `content/cs/intro/10-uvod.md`
 * @property {string} markdown obsah s konci řádků LF, bez okrajových mezer
 */

/**
 * Pokrytí specifikace texty: skupiny v pořadí menu a jejich operace; `described`
 * říká, jestli mají text. Operace je u své první skupiny, operace bez skupiny
 * ve skupině s názvem `null`.
 * @typedef {{name: string | null, described: boolean, operations: {label: string, described: boolean}[]}[]} Coverage
 */

/** Cesta souboru s textem pro hlášení, například `content/cs/intro/10-uvod.md`. */
const textWhere = (contentDir, language, path) => `${basename(contentDir)}/${language}/${path}`;

/**
 * Texty, které v některém jiném jazyce nemají protějšek se stejnou cestou.
 * Takový text se v druhém jazyce nezobrazí; jiným jazykem se nedoplňuje.
 * @param {string} contentDir složka s texty, pro každý jazyk jedna podsložka
 * @param {Map<string, Text[]>} textsByLanguage texty podle jazyka
 * @returns {{text: Text, missing: string}[]} text a cesta chybějícího protějšku pro hlášení
 */
export function missingCounterparts(contentDir, textsByLanguage) {
  const paths = new Map([...textsByLanguage].map(([language, texts]) => [language, new Set(texts.map(({ path }) => path))]));
  return [...textsByLanguage].flatMap(([language, texts]) =>
    texts.flatMap((text) =>
      [...paths]
        .filter(([other, otherPaths]) => other !== language && !otherPaths.has(text.path))
        .map(([other]) => ({ text, missing: textWhere(contentDir, other, text.path) })),
    ),
  );
}

/**
 * Načte texty jednoho jazyka seřazené podle cesty. Jazyk bez složky nemá žádné.
 * @returns {Promise<Text[]>}
 */
export async function readTexts(contentDir, language) {
  const languageDir = join(contentDir, language);
  let entries;
  try {
    entries = await readdir(languageDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(languageDir, join(entry.parentPath, entry.name)).split(sep))
    .filter((segments) => !segments.some((segment) => /^[_.]/.test(segment)))
    .map((segments) => segments.join('/'))
    .sort();
  const where = (path) => textWhere(contentDir, language, path);
  const stray = paths.filter((path) => !KINDS.some((kind) => new RegExp(`^${kind}/[^/]+\\.md$`).test(path)));
  if (stray.length > 0) {
    throw new Error(
      `Soubory nejsou text úvodu, skupiny ani operace:\n  ${stray.map(where).join('\n  ')}\n` +
        `Text patří přímo do složky ${KINDS.map((kind) => `${kind}/`).join(', ')} a má příponu .md; pomocný soubor začíná podtržítkem.`,
    );
  }
  return Promise.all(
    paths.map(async (path) => {
      const [kind, file] = path.split('/');
      const markdown = (await readFile(join(languageDir, path), 'utf8')).replace(/\r\n?/g, '\n').trim();
      return { kind, name: file.slice(0, -'.md'.length), path, where: where(path), markdown };
    }),
  );
}

/**
 * Formátování v nadpisu: znaky Markdownu, dvojice podtržítek a entity HTML.
 * Scalar 1.78.1 čte text takového nadpisu pro menu jinak než pro stránku,
 * takže by položka menu nikam nevedla.
 */
const HEADING_FORMATTING = /[`*~[\]<>\\]|_.*_|&#?\w+;/;

/** Chyby v textech, které nezávisí na prostředí: prázdné soubory a kapitoly úvodu, které by rozbily menu. */
function textProblems(texts) {
  const problems = [];
  for (const { kind, where, markdown } of texts) {
    if (markdown === '') {
      problems.push(`${where}: soubor je prázdný`);
      continue;
    }
    for (const destination of linkDefinitions(markdown).filter(isTextLink)) {
      problems.push(`${where}: odkaz ${destination} je zapsaný definicí pod čarou; odkaz na text pište jako [text](soubor.md)`);
    }
    if (kind !== 'intro') continue;
    if (!/^# +\S/.test(markdown)) problems.push(`${where}: kapitola úvodu musí začínat nadpisem první úrovně, například „# Název kapitoly“`);
    for (const heading of headings(markdown)) {
      if (HEADING_FORMATTING.test(heading.text)) {
        problems.push(
          `${where}: nadpis „${heading.text}“ musí být prostý text bez formátování (znaky \` * ~ [ ] < > \\, dvojice podtržítek, entity jako &amp;), jinak k němu Scalar z menu nedoskočí`,
        );
      }
    }
    // Scalar takový nadpis čísluje s ostatními, build ho nečte; adresy opakovaných nadpisů by se rozešly.
    for (const heading of underlinedHeadings(markdown)) {
      problems.push(`${where}: „${heading}“ je nadpis zapsaný podtržením; nadpis pište křížky (## Nadpis) a vodorovnou čáru oddělte prázdným řádkem`);
    }
  }
  return problems;
}

/** Cíl odkazu rozdělený na cestu k souboru a nadpis za `#`; kódování z adresy je pryč. */
function parseDestination(destination) {
  const decode = (part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  };
  const hash = destination.indexOf('#');
  return hash === -1 ? { file: decode(destination), fragment: null } : { file: decode(destination.slice(0, hash)), fragment: decode(destination.slice(hash + 1)) };
}

/**
 * Odkaz na text: na soubor `.md` nebo na nadpis v témže souboru (`#nadpis`).
 * Odkazy na web (`https:`, `mailto:`) a na jiné soubory build nechává být.
 */
const isTextLink = (destination) => !/^[a-z][a-z0-9+.-]*:/i.test(destination) && /^(#|[^#]*\.md(#|$))/i.test(destination);

/**
 * Najde, kam odkaz z textu `source` vede: na text, nebo na skupinu či operaci,
 * která text ještě nemá a odkazuje se na ni souborem, ve kterém její text bude.
 * @param {Text} source
 * @param {Map<string, Text>} textsByPath
 * @param {{tags: Set<string>, operations: Set<string>}} expectedNames názvy textů, které sedí na skupinu nebo operaci aspoň v jednom prostředí
 * @returns {{path: string, headingIndex: number | null} | {problem: string}}
 *   `path` je cesta cílového souboru ve složce jazyka, `headingIndex` pořadí
 *   nadpisu v cílovém textu, `null` u odkazu na celý text
 */
function resolveLink(source, destination, textsByPath, expectedNames) {
  const { file, fragment } = parseDestination(destination);
  const path = file === '' ? source.path : posix.normalize(posix.join(posix.dirname(source.path), file));
  const target = textsByPath.get(path);
  if (!target) {
    const [, kind, name] = /^(tags|operations)\/([^/]+)\.md$/.exec(path) ?? [];
    if (!expectedNames[kind]?.has(name)) {
      const hint = kind ? caseHint(expectedNames[kind], name) : '';
      return { problem: `${source.where}: odkaz ${destination} vede na soubor, který mezi texty tohoto jazyka není a neodpovídá žádné skupině ani operaci${hint}` };
    }
    if (fragment) return { problem: `${source.where}: odkaz ${destination} vede na nadpis, ale ${kind === 'tags' ? 'skupina' : 'operace'} text zatím nemá` };
    return { path, headingIndex: null };
  }
  if (!fragment) return { path, headingIndex: null };
  // Kotvy na GitHubu a adresy ve Scalaru se liší jen v pomlčkách a podtržítkách; `slugify` je sjednotí.
  const nextSlug = slugger();
  const anchors = headings(target.markdown).map(({ text }) => nextSlug(text));
  const headingIndex = anchors.indexOf(slugify(fragment));
  if (headingIndex === -1) {
    const available = anchors.length > 0 ? `; nadpisy v souboru: ${anchors.map((anchor) => `#${anchor}`).join(', ')}` : '; soubor žádné nadpisy nemá';
    return { problem: `${source.where}: odkaz ${destination} vede na nadpis, který v ${target.where} není${available}` };
  }
  return { path, headingIndex };
}

/**
 * Úvod s upozorněním prostředí hned pod prvním nadpisem. Před nadpis nepatří:
 * text před prvním nadpisem by ve Scalaru přidal do menu položku navíc.
 */
function withNotice(intro, environment, language) {
  if (!environment.notice) return intro;
  const notice = environment.notice[language];
  if (!notice) throw new Error(`${environmentLabel(environment.slug)}: upozornění (notice) nemá znění pro jazyk ${language}`);
  // Zápis upozornění z GitHubu; Scalar ho vykreslí jako výrazný rámeček.
  const block = `> [!WARNING]\n> ${notice}`;
  if (!intro) return block;
  const [heading, ...rest] = intro.split('\n');
  return [heading, '', block, ...rest].join('\n');
}

/** Položka skupiny ve specifikaci; skupinu, kterou specifikace sama neuvádí, zařadí Scalar za uvedené. */
function tagEntry(spec, name) {
  spec.tags ??= [];
  let tag = spec.tags.find((candidate) => candidate.name === name);
  if (!tag) spec.tags.push((tag = { name }));
  return tag;
}

/**
 * @param {object} spec
 * @param {{groups: Set<string>, operations: Set<object>}} described skupiny (názvem) a operace (objektem ze `spec`), které mají text
 * @returns {Coverage}
 */
function coverageOf(spec, described) {
  const all = [...operations(spec)];
  const byFirstGroup = Map.groupBy(all, ({ operation }) => operation.tags?.[0] ?? null);
  const groups = new Set(all.flatMap(({ operation }) => operation.tags ?? []));
  // Pořadí jako v menu: nejdřív skupiny, které specifikace uvádí, pak ostatní.
  const order = [...new Set([...(spec.tags ?? []).map((tag) => tag.name).filter((name) => groups.has(name)), ...groups]), ...(byFirstGroup.has(null) ? [null] : [])];
  return order.map((group) => ({
    name: group,
    described: described.groups.has(group),
    operations: (byFirstGroup.get(group) ?? []).map(({ method, path, operation }) => ({
      label: `${method.toUpperCase()} ${path}`,
      described: described.operations.has(operation),
    })),
  }));
}

/**
 * Vloží texty jednoho jazyka do specifikací všech prostředí: úvod do
 * `info.description`, text skupiny do `tags[].description` a popis operace
 * do jejího `description`. Odkazy mezi texty převede na adresy ve Scalaru
 * a zástupné symboly nahradí hodnotami prostředí.
 *
 * Text skupiny nebo operace, která v prostředí není, se tam nevloží (nová
 * operace se obvykle objeví nejdřív v TEST, docs/adr/0004) a z odkazu na
 * takovou skupinu nebo operaci tam zůstane jen text. Osiřelý text, tedy text
 * bez skupiny nebo operace ve všech prostředích, je chyba: operace se nejspíš
 * přejmenovala nebo zmizela. Chyba je i odkaz, který nevede na žádný text,
 * nadpis, skupinu ani operaci.
 *
 * Prostředí s upozorněním (`notice`, znění pro každý jazyk) ho má hned pod
 * prvním nadpisem úvodu.
 *
 * @param {object} options
 * @param {Map<string, object>} options.specs specifikace podle `slug` prostředí
 * @param {{slug: string, baseUrl: string, tokenUrl: string, notice?: Record<string, string>}[]} options.environments
 * @param {Text[]} options.texts
 * @param {string} options.language jazyk textů, například `cs`
 * @param {{info: (message: string) => void}} options.log
 * @returns {{specs: Map<string, object>, coverage: Map<string, Coverage>}}
 *   nové specifikace a pokrytí texty, obojí podle `slug` prostředí; vstupní
 *   specifikace zůstanou beze změny
 */
export function insertTexts({ specs, environments, texts, language, log }) {
  const problems = new Set(textProblems(texts));
  const textsByPath = new Map(texts.map((text) => [text.path, text]));
  // Scalar čísluje opakované nadpisy přes celý úvod, ne po kapitolách.
  const nextIntroSlug = slugger();
  const introSlugs = new Map(
    texts.filter(({ kind }) => kind === 'intro').map((text) => [text, headings(text.markdown).map((heading) => nextIntroSlug(heading.text))]),
  );

  const parts = environments.map((environment) => {
    const spec = structuredClone(specs.get(environment.slug));
    return {
      environment,
      spec,
      operationsByName: Map.groupBy(operations(spec), ({ method, path }) => operationTextName(method, path)),
      groups: new Set([...operations(spec)].flatMap(({ operation }) => operation.tags ?? [])),
    };
  });
  /** Názvy textů, které sedí na skupinu nebo operaci aspoň v jednom prostředí, podle druhu. */
  const expectedNames = {
    tags: new Set(parts.flatMap(({ groups }) => [...groups])),
    operations: new Set(parts.flatMap(({ operationsByName }) => [...operationsByName.keys()])),
  };

  const result = new Map();
  const coverage = new Map();
  for (const { environment, spec, operationsByName, groups } of parts) {
    const { slug } = environment;
    const intro = [];
    const described = { groups: new Set(), operations: new Set() };
    /**
     * Adresy ve Scalaru podle cesty souboru s textem; skupina a operace ji mají,
     * i když text ještě nemají. Na nadpis v textu skupiny ani operace Scalar
     * spolehlivě necílí, jejich adresa je vždy celá skupina nebo operace.
     * @type {Map<string, (headingIndex: number | null) => string>}
     */
    const addresses = new Map();
    /** Cesty souborů, jejichž název sedí na více operací: lomítko i podtržítko v cestě dají v názvu podtržítko. */
    const ambiguous = new Map();
    /** Operace prostředí podle cesty souboru s popisem. */
    const operationsByPath = new Map();
    for (const name of groups) addresses.set(textPath('tags', name), () => groupAddress(slug, name));
    for (const [name, candidates] of operationsByName) {
      const path = textPath('operations', name);
      if (candidates.length > 1) {
        ambiguous.set(path, candidates.map((candidate) => `${candidate.method.toUpperCase()} ${candidate.path}`).join(' a '));
        continue;
      }
      const [{ method, path: apiPath, operation }] = candidates;
      operationsByPath.set(path, operation);
      addresses.set(path, () => operationAddress(slug, operation.tags?.[0], method, apiPath));
    }

    /** Texty, které do prostředí patří, a kam se vloží. @type {Map<Text, (markdown: string) => void>} */
    const inserts = new Map();
    for (const text of texts) {
      const { kind, name } = text;
      if (kind === 'intro') {
        addresses.set(text.path, (headingIndex) => headingAddress(slug, introSlugs.get(text)[headingIndex ?? 0]));
        inserts.set(text, (markdown) => intro.push(markdown));
      } else if (kind === 'tags' && groups.has(name)) {
        described.groups.add(name);
        inserts.set(text, (markdown) => (tagEntry(spec, name).description = markdown));
      } else if (ambiguous.has(text.path)) {
        problems.add(`${text.where}: název souboru odpovídá více operacím (${ambiguous.get(text.path)}), popis nejde přiřadit`);
      } else if (operationsByPath.has(text.path)) {
        const operation = operationsByPath.get(text.path);
        described.operations.add(operation);
        inserts.set(text, (markdown) => (operation.description = markdown));
      }
    }

    const values = environmentValues(environment);
    for (const [text, insert] of inserts) {
      const linked = mapLinks(text.markdown, (destination) => {
        if (!isTextLink(destination)) return undefined;
        const resolved = resolveLink(text, destination, textsByPath, expectedNames);
        if (resolved.problem) {
          problems.add(resolved.problem);
          return undefined;
        }
        if (ambiguous.has(resolved.path)) {
          problems.add(`${text.where}: odkaz ${destination} odpovídá více operacím (${ambiguous.get(resolved.path)})`);
          return undefined;
        }
        const address = addresses.get(resolved.path);
        if (!address) {
          log.info(
            `${versionLabel(language, slug)}: ${text.where}: odkaz ${destination} vede na skupinu nebo operaci, která v prostředí není; zůstal jen text bez odkazu`,
          );
          return null;
        }
        return address(resolved.headingIndex);
      });
      insert(fillPlaceholders(linked, values, text.where));
    }
    const description = withNotice(intro.join('\n\n'), environment, language);
    if (description) spec.info.description = description;
    result.set(slug, spec);
    coverage.set(slug, coverageOf(spec, described));
  }

  const orphans = texts.filter(({ kind, name }) => kind !== 'intro' && !expectedNames[kind].has(name));
  const describeOrphan = ({ kind, name, where }) => `${where}${caseHint(expectedNames[kind], name)}`;
  const errors = [
    ...(orphans.length > 0
      ? [`Osiřelé texty: skupina nebo operace není v žádném prostředí (přejmenovala se nebo zmizela):\n  ${orphans.map(describeOrphan).join('\n  ')}`]
      : []),
    ...(problems.size > 0 ? [`Chyby v textech:\n  ${[...problems].join('\n  ')}`] : []),
  ];
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return { specs: result, coverage };
}

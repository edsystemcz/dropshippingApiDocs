// Úprava zdrojové specifikace bez změny backendu (docs/adr/0001): build v ní
// zkrátí názvy schémat, opraví hlavičky odpovědí, které neprojdou validací,
// a sloučí do ní doplňky ze složky overlay/.
//
// Soubor overlay je kus specifikace OpenAPI. Soubory se slučují v abecedním
// pořadí podle JSON Merge Patch (RFC 7386): objekty do hloubky, `null` klíč
// odstraní (tak se třeba `$ref` nahradí polem), pole a ostatní hodnoty se
// nahradí celé. Texty jsou česky a smějí obsahovat zástupné symboly prostředí.
// Schémata se v overlay píší zkráceným názvem, tak jak je vidí návštěvník.
//
// Klíče se zvláštním významem:
//   paths       doplňky existujících operací; kde operace není, se přeskočí
//   components  doplňky existujících komponent (schémat, schémat zabezpečení);
//               kde komponenta není, se přeskočí
//   tags        pořadí a zobrazované názvy skupin (x-displayName); skupina bez
//               operací se v prostředí vynechá
//   newPaths    operace, které ve specifikaci chybějí; přidají se všude
//   schemaNames vlastní název schématu (celý název → název na webu) pro
//               schémata, která by po zkrácení měla stejný název
// Doplněk z paths, components, tags nebo schemaNames, který nesedí na žádné
// prostředí, shodí build. Ostatní klíče (například servers) se slučují všude.

import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { environmentLabel, environmentValues } from './environments.mjs';
import { HTTP_METHODS, mapStrings, operations } from './openapi.mjs';
import { fillPlaceholders } from './placeholders.mjs';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Sloučí doplněk do cíle podle JSON Merge Patch (RFC 7386): objekty se slučují
 * do hloubky, `null` klíč odstraní, cokoli jiného (i pole) hodnotu nahradí.
 */
function mergePatch(target, patch) {
  if (!isObject(patch)) return patch;
  const result = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

const SCHEMA_REF = '#/components/schemas/';

/**
 * Zkrátí názvy schémat na poslední část za tečkou
 * (`Elinkx.Dropship.Api.Web.Models.Products.ProductCatalogModel` → `ProductCatalogModel`)
 * a přepíše na ně všechny odkazy `$ref`. Mění se jen zobrazovaný název, ne chování API.
 * Schéma uvedené v `explicitNames` (celý název → název na webu) dostane název odtud.
 */
function shortenSchemaNames(spec, explicitNames) {
  const names = new Map(
    Object.keys(spec.components?.schemas ?? {}).map((name) => [name, explicitNames.get(name) ?? name.split('.').pop()]),
  );
  // Dvě různá schémata pod jedním názvem by se na webu nedala rozlišit.
  const collisions = Object.entries(Object.groupBy(names.keys(), (name) => names.get(name))).filter(([, group]) => group.length > 1);
  if (collisions.length > 0) {
    const list = collisions.map(([short, group]) => `${short}: ${group.join(', ')}`).join('\n  ');
    throw new Error(
      `Schémata mají po zkrácení stejný název:\n  ${list}\n` +
        'Doplňte v overlay do schemaNames vlastní název aspoň pro jedno z nich, například ' +
        `"schemaNames": { "${collisions[0][1][0]}": "<název>" }`,
    );
  }
  const renameRef = (target) => {
    if (!target.startsWith(SCHEMA_REF)) return target;
    const [name, ...rest] = target.slice(SCHEMA_REF.length).split('/');
    return names.has(name) ? SCHEMA_REF + [names.get(name), ...rest].join('/') : target;
  };
  // Kopie celé specifikace, takže další kroky smějí výsledek měnit.
  const result = mapStrings(spec, (text, key) => (key === '$ref' ? renameRef(text) : text));
  if (names.size > 0) {
    result.components.schemas = Object.fromEntries(Object.entries(result.components.schemas).map(([name, schema]) => [names.get(name), schema]));
  }
  return result;
}

/**
 * Doplní schéma `string` hlavičkám odpovědí, které nemají schéma ani obsah.
 * Backend tak popisuje `WWW-Authenticate` u objednávek a OpenAPI 3.0 jednu
 * z těch dvou vlastností vyžaduje; hodnota hlavičky HTTP je vždy text.
 * Upravuje předanou specifikaci.
 */
function addHeaderSchemas(spec) {
  const responses = [
    ...[...operations(spec)].flatMap(({ operation }) => Object.values(operation.responses ?? {})),
    ...Object.values(spec.components?.responses ?? {}),
  ];
  for (const header of responses.flatMap((response) => Object.values(response.headers ?? {}))) {
    if (!('schema' in header || 'content' in header || '$ref' in header)) header.schema = { type: 'string' };
  }
}

/** Soubory overlay v abecedním pořadí: `{name, content}`, kde `name` je cesta pro hlášení. */
export async function readOverlays(overlayDir) {
  const names = (await readdir(overlayDir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(
    names.map(async (file) => {
      const name = `${basename(overlayDir)}/${file}`;
      try {
        return { name, content: JSON.parse(await readFile(join(overlayDir, file), 'utf8')) };
      } catch (error) {
        throw new Error(`${name}: ${error.message}`, { cause: error });
      }
    }),
  );
}

/**
 * Upraví specifikace všech prostředí: zkrátí názvy schémat, doplní schéma
 * hlavičkám bez schématu a sloučí doplňky z overlay (pravidla v hlavičce modulu).
 *
 * Doplněk pro operaci, která v prostředí není, se tam přeskočí (nová operace
 * se obvykle objeví nejdřív v TEST, docs/adr/0004). Doplněk, který nesedí na
 * žádné prostředí, je chyba: operace se nejspíš přejmenovala nebo zmizela.
 *
 * Zástupné symboly (`{{baseUrl}}`, `{{tokenUrl}}`, `{{envSlug}}`) dostanou
 * v každém prostředí jeho hodnotu.
 *
 * @param {object} options
 * @param {Map<string, object>} options.specs specifikace podle `slug` prostředí
 * @param {{slug: string, baseUrl: string, tokenUrl: string}[]} options.environments
 * @param {{name: string, content: object}[]} options.overlays doplňky v pořadí, v jakém se slučují
 * @param {{info: (message: string) => void, warn: (message: string) => void}} options.log
 * @returns {Map<string, object>} nové specifikace; vstupní zůstanou beze změny
 */
export function applyOverlays({ specs, environments, overlays, log }) {
  // Doplněk → počet prostředí, do kterých se sloučil.
  const matches = new Map();
  const count = (target, matched) => matches.set(target, (matches.get(target) ?? 0) + (matched ? 1 : 0));
  for (const { name, content } of overlays) {
    for (const key of ['paths', 'newPaths']) {
      for (const [path, item] of Object.entries(content[key] ?? {})) {
        const other = Object.keys(item).find((method) => !HTTP_METHODS.includes(method));
        if (other) throw new Error(`${name}: ${key}/${path} obsahuje „${other}“, což není metoda HTTP; v ${key} jsou jen operace`);
      }
    }
  }
  // Vlastní názvy schémat ze všech souborů; při shodě vyhrává pozdější soubor.
  const schemaNames = overlays.flatMap(({ name, content }) =>
    Object.entries(content.schemaNames ?? {}).map(([schema, display]) => ({ target: `${name}: schemaNames/${schema}`, schema, display })),
  );
  const explicitNames = new Map(schemaNames.map(({ schema, display }) => [schema, display]));
  const result = new Map();
  for (const environment of environments) {
    const label = environmentLabel(environment.slug);
    const source = specs.get(environment.slug);
    for (const { target, schema } of schemaNames) count(target, Object.hasOwn(source.components?.schemas ?? {}, schema));
    let spec = shortenSchemaNames(source, explicitNames);
    addHeaderSchemas(spec);
    const values = environmentValues(environment);
    /** Zapíše, jestli cíl doplňku v prostředí je; když není, oznámí přeskočení. */
    const matched = (target, exists, missing) => {
      count(target, exists);
      if (!exists) log.info(`${label}: doplněk ${target} přeskočen, ${missing}`);
      return exists;
    };
    /** Sloučí doplněk do `parent[key]`; když tam cíl není, doplněk přeskočí. */
    const patchExisting = (parent, key, patch, target, missing) => {
      if (matched(target, Boolean(parent?.[key]), missing)) parent[key] = mergePatch(parent[key], patch);
    };
    // Skupiny se stejně jako jiná pole nahrazují celé: platí poslední soubor, který je uvádí.
    let tags = null;
    for (const { name, content } of overlays) {
      const { schemaNames: _, paths, newPaths, components, ...rest } = mapStrings(content, (text) => fillPlaceholders(text, values, name));
      for (const [type, entries] of Object.entries(components ?? {})) {
        for (const [component, patch] of Object.entries(entries)) {
          patchExisting(spec.components?.[type], component, patch, `${name}: components/${type}/${component}`, 'komponenta v prostředí není');
        }
      }
      for (const [path, item] of Object.entries(paths ?? {})) {
        for (const [method, patch] of Object.entries(item)) {
          patchExisting(spec.paths[path], method, patch, `${name}: ${method.toUpperCase()} ${path}`, 'operace v prostředí není');
        }
      }
      for (const [path, item] of Object.entries(newPaths ?? {})) {
        for (const [method, operation] of Object.entries(item)) {
          if (spec.paths[path]?.[method]) {
            log.warn(
              `${label}: ${name}: nová operace ${method.toUpperCase()} ${path} už ve specifikaci je, doplněk ji jen doplní; ` +
                'až bude ve všech prostředích, přesuňte ji z newPaths do paths a nechte jen to, co backend nemá',
            );
          }
          spec.paths[path] ??= {};
          spec.paths[path][method] = mergePatch(spec.paths[path][method], operation);
        }
      }
      if (rest.tags) tags = { file: name, list: rest.tags };
      spec = mergePatch(spec, rest);
    }
    if (tags) {
      // Skupinu tvoří operace; skupina bez operací by v menu zůstala prázdná.
      const groups = new Set([...operations(spec)].flatMap(({ operation }) => operation.tags ?? []));
      spec.tags = tags.list.filter((tag) =>
        matched(`${tags.file}: skupina ${tag.name}`, groups.has(tag.name), 'skupina v prostředí nemá operace'),
      );
    }
    result.set(environment.slug, spec);
  }
  const unmatched = [...matches].filter(([, environmentCount]) => environmentCount === 0).map(([target]) => target);
  if (unmatched.length > 0) {
    throw new Error(`Doplňky nesedí na žádné prostředí (cíl se přejmenoval nebo zmizel):\n  ${unmatched.join('\n  ')}`);
  }
  return result;
}

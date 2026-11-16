// Co se změnilo mezi dvěma verzemi zdrojové specifikace: které operace
// a schémata přibyly, zmizely nebo mají jinou definici. Přehled jde do zprávy
// commitu, kterým workflow novou specifikaci ukládá, aby bylo z historie
// vidět, čemu je potřeba doplnit nebo upravit text.

import { isDeepStrictEqual } from 'node:util';
import { operations } from './openapi.mjs';

/** Názvy schémat ve zdroji nesou interní předpony; build i přehled ukazují jen poslední část. */
const shortName = (name) => name.split('.').pop();

const unique = (names) => [...new Set(names)];

/** @param {Map<string, {label: string, definition: unknown}>} before @param {typeof before} after */
const compare = (before, after) => ({
  added: unique([...after].filter(([key]) => !before.has(key)).map(([, { label }]) => label)),
  removed: unique([...before].filter(([key]) => !after.has(key)).map(([, { label }]) => label)),
  changed: unique(
    [...after].filter(([key, { definition }]) => before.has(key) && !isDeepStrictEqual(before.get(key).definition, definition)).map(([, { label }]) => label),
  ),
});

const operationsOf = (spec) =>
  new Map([...operations(spec)].map(({ method, path, operation }) => [`${method} ${path}`, { label: `${method.toUpperCase()} ${path}`, definition: operation }]));

const schemasOf = (spec) => new Map(Object.entries(spec.components?.schemas ?? {}).map(([name, schema]) => [name, { label: shortName(name), definition: schema }]));

/**
 * @typedef {{added: string[], removed: string[], changed: string[]}} Difference
 * @returns {{operations: Difference, schemas: Difference}} operace jako `GET /cesta`, schémata zkráceným názvem
 */
export const specChanges = (before, after) => ({
  operations: compare(operationsOf(before), operationsOf(after)),
  schemas: compare(schemasOf(before), schemasOf(after)),
});

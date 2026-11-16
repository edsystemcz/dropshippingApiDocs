// Pomůcky pro procházení specifikace OpenAPI.

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Operace specifikace: kombinace metody a cesty. Ostatní klíče cesty
 * (`parameters`, `summary`) operace nejsou.
 * @returns {Generator<{path: string, method: string, operation: object}>}
 */
export function* operations(spec) {
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      if (method in item) yield { path, method, operation: item[method] };
    }
  }
}

/**
 * Kopie hodnoty JSON, ve které funkce `map(text, key)` upravila každý řetězec;
 * `key` je klíč, pod kterým řetězec v objektu leží. Klíče objektů zůstanou.
 */
export const mapStrings = (value, map, key) => {
  if (typeof value === 'string') return map(value, key);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, mapStrings(item, map, name)]));
  }
  return value;
};

/**
 * Všechny řetězce hodnoty JSON s místem, kde leží: `paths › /Info › get › summary`.
 * @returns {Generator<{text: string, location: string}>}
 */
export function* locatedStrings(value, location = []) {
  if (typeof value === 'string') yield { text: value, location: location.join(' › ') };
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) yield* locatedStrings(item, [...location, key]);
  }
}

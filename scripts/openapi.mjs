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

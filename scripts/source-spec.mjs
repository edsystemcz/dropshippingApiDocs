// Zdrojová specifikace: kopie toho, co vrací API, uložená ve spec/ (docs/adr/0001).

import { join } from 'node:path';

/** Cesta k uložené zdrojové specifikaci prostředí. */
export const sourceSpecPath = (specDir, slug) => join(specDir, `swagger.${slug}.source.json`);

/** Číslo buildu API je jen v titulku zdrojové specifikace: „…, build: 1.1.122“. */
export const buildNumber = (spec) => /build:\s*(\d+(?:\.\d+)*)/.exec(spec.info.title ?? '')?.[1] ?? null;

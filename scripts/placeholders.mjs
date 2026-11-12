// Zástupné symboly {{název}}: hodnoty, které se liší mezi prostředími, se do
// textů a overlay píší symbolem a build je doplní (docs/adr/0004).

/**
 * Vyplní zástupné symboly v textu. Neznámý symbol je chyba; `where` říká,
 * odkud text pochází, aby hlášení vedlo ke správnému souboru.
 */
export const fillPlaceholders = (text, values, where) =>
  text.replace(/\{\{(\w+)\}\}/g, (symbol, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`${where} obsahuje neznámý zástupný symbol ${symbol}`);
    return values[name];
  });

/** Hodnoty symbolů, které se liší mezi prostředími. */
export const environmentValues = ({ slug, baseUrl, tokenUrl }) => ({ baseUrl, tokenUrl, envSlug: slug });

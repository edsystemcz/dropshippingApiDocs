// Neveřejné údaje, které se nesmějí dostat na web (ZADANI část 13): adresa
// z domény společnosti jiná než zákaznická péče a skutečná hodnota client_id.
// Build je hledá ve výsledných specifikacích a stránkách, protože nová
// specifikace z API i text upravený ve webovém rozhraní GitHubu se nasazují
// bez toho, aby je před tím někdo četl.

/** Jediná adresa společnosti, která smí být veřejná. */
export const SUPPORT_ADDRESS = 'customercare@edsystem.cz';

/** Adresa v doméně společnosti nebo její subdoméně, i bez části před zavináčem. */
const COMPANY_ADDRESS = /[\w.%+-]*@(?:[\w-]+\.)*edsystem\.cz\b/gi;

/** Parametr požadavku na token, jehož hodnota je neveřejná; ukázky za něj píšou zástupnou hodnotu `{clientId}`. */
const CLIENT_ID = 'client_id';

/** Parametr s rovnítkem, za kterým zástupná hodnota není; zachytí, co tam je místo ní. */
const CLIENT_ID_VALUE = new RegExp(`${CLIENT_ID}=(?!\\{clientId\\})([^\\s'"\`&<]*)`, 'g');

/**
 * Neveřejné údaje v textu.
 * @returns {{value: string, problem: string}[]} `value` je údaj tak, jak v textu stojí
 */
export function nonPublicValues(text) {
  const addresses = [...text.matchAll(COMPANY_ADDRESS)]
    .filter(([address]) => address.toLowerCase() !== SUPPORT_ADDRESS)
    .map(([address]) => ({ value: address, problem: `adresa ${address} (povolená je jen ${SUPPORT_ADDRESS})` }));
  const clientIds = [...text.matchAll(CLIENT_ID_VALUE)].map(([parameter, value]) => ({
    value: parameter,
    problem: `za ${CLIENT_ID}= je „${value}“, smí tam být jen {clientId}`,
  }));
  return [...addresses, ...clientIds];
}

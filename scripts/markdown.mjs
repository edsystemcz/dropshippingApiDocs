// Čtení Markdownu v rozsahu, který build potřebuje: nadpisy a odkazy mimo
// ukázky kódu. Není to úplný parser: nadpisy se píší křížky (`## Nadpis`),
// odkazy jako `[text](cíl)` a ukázka kódu je ohrazený blok (```) nebo řádkový
// kód (`…`); blok kódu odsazený čtyřmi mezerami se čte jako běžný text.

/** Začátek nebo konec ohrazeného bloku kódu: aspoň tři zpětné apostrofy nebo vlnovky. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Úseky textu po řadě: souvislá próza a ohrazené bloky kódu.
 * @returns {{code: boolean, text: string}[]} spojením úseků znakem `\n` vznikne původní text
 */
function blocks(markdown) {
  const result = [];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const [, marker, rest] = FENCE.exec(line) ?? [];
    const last = result.at(-1);
    if (fence) {
      last.text += `\n${line}`;
      if (marker?.startsWith(fence) && rest.trim() === '') fence = null;
    } else if (marker) {
      fence = marker;
      result.push({ code: true, text: line });
    } else if (last && !last.code) {
      last.text += `\n${line}`;
    } else {
      result.push({ code: false, text: line });
    }
  }
  return result;
}

/** Upraví prózu funkcí `map`; ohrazené bloky kódu nechá být. */
const mapProse = (markdown, map) =>
  blocks(markdown)
    .map(({ code, text }) => (code ? text : map(text)))
    .join('\n');

/** Úseky prózy, tedy text bez ohrazených bloků kódu. */
const prose = (markdown) =>
  blocks(markdown)
    .filter(({ code }) => !code)
    .map(({ text }) => text);

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
/** Podtržení, které z předchozího řádku dělá nadpis. */
const UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

/**
 * Nadpisy textu v pořadí, v jakém jdou za sebou.
 * @returns {{level: number, text: string}[]} `text` je nadpis tak, jak je zapsaný
 */
export function headings(markdown) {
  return prose(markdown)
    .flatMap((text) => text.split('\n'))
    .map((line) => HEADING.exec(line))
    .filter((match) => match?.[2])
    .map(([, hashes, text]) => ({ level: hashes.length, text }));
}

/**
 * Řádky, ze kterých dělá nadpis podtržení (`===` nebo `---` hned pod textem).
 * Build takové nadpisy nečte; kdo je potřebuje vyloučit, najde je tady.
 */
export function underlinedHeadings(markdown) {
  return prose(markdown).flatMap((text) => {
    const lines = text.split('\n');
    return lines.filter((line, index) => line.trim() !== '' && !HEADING.test(line) && !UNDERLINE.test(line) && UNDERLINE.test(lines[index + 1] ?? '')).map((line) => line.trim());
  });
}

/** Řádkový kód: stejně dlouhá řada zpětných apostrofů na obou stranách, v rámci odstavce. */
const INLINE_CODE = /(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/;
/** Odkaz `[text](cíl "titulek")`; text smí obsahovat kód a jednu úroveň hranatých závorek. */
const INLINE_LINK = /\[((?:[^[\]\\]|\\.|\[[^[\]]*\])*)\]\(\s*(<[^<>\n]*>|[^\s()<>]+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*)\)/;
const CODE_OR_LINK = new RegExp(`${INLINE_CODE.source}|${INLINE_LINK.source}`, 'g');
/** Definice odkazu pod čarou: `[značka]: cíl`. */
const LINK_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^<>\n]*>|\S+)/gm;

const withoutBrackets = (destination) => (destination.startsWith('<') ? destination.slice(1, -1) : destination);

/**
 * Přepíše cíle odkazů `[text](cíl)` mimo ukázky kódu. Funkce `map(cíl)` vrátí
 * nový cíl, `null` (z odkazu zůstane jen jeho text), nebo `undefined` (odkaz
 * zůstane, jak je).
 */
export function mapLinks(markdown, map) {
  return mapProse(markdown, (part) =>
    part.replace(CODE_OR_LINK, (match, code, label, destination, title) => {
      if (code) return match;
      const mapped = map(withoutBrackets(destination));
      if (mapped === undefined) return match;
      return mapped === null ? label : `[${label}](${mapped}${title})`;
    }),
  );
}

/** Cíle odkazů `[text](cíl)` mimo ukázky kódu. */
export function linkDestinations(markdown) {
  const destinations = [];
  mapLinks(markdown, (destination) => void destinations.push(destination));
  return destinations;
}

/** Cíle definic odkazů pod čarou (`[značka]: cíl`) mimo ukázky kódu. */
export function linkDefinitions(markdown) {
  return prose(markdown).flatMap((text) => [...text.matchAll(LINK_DEFINITION)].map(([, destination]) => withoutBrackets(destination)));
}

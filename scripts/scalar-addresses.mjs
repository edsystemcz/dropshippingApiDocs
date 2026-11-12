// Adresy, pod kterými Scalar zobrazuje části specifikace: první částí za `#`
// je prostředí (docs/adr/0004). Build je potřebuje pro odkazy mezi texty.
//
// Pravidla jsou opsaná ze Scalaru 1.78.1 (balíčky @scalar/helpers
// a @scalar/workspace-store) a ověřená v prohlížeči. Po změně verze Scalaru je
// ověř znovu: `npm run verify` projde odkazy v textech a položky menu.

/**
 * Část adresy z nadpisu nebo názvu skupiny: malá písmena, diakritika zůstává,
 * interpunkce mizí a mezery, podtržítka a pomlčky se slijí do jedné pomlčky.
 */
export const slugify = (text) =>
  text
    .slice(0, 255)
    .trim()
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Přiděluje nadpisům části adresy; opakovaný nadpis dostane pořadí
 * (`příklad`, `příklad-1`, `příklad-2`), stejně jako kotvy na GitHubu.
 */
export function slugger() {
  const seen = new Map();
  return (text) => {
    const base = slugify(text);
    const count = seen.get(base);
    seen.set(base, count === undefined ? 0 : count + 1);
    return count === undefined ? base : `${base}-${count + 1}`;
  };
}

/** Adresa nadpisu v úvodu; `headingSlug` přiděluje `slugger` přes celý úvod. */
export const headingAddress = (environmentSlug, headingSlug) => `#${environmentSlug}/description/${headingSlug}`;

/** Adresa skupiny; vzniká z technického názvu, zobrazovaný ji nemění. */
export const groupAddress = (environmentSlug, group) => `#${environmentSlug}/tag/${slugify(group)}`;

/** Adresa operace; `group` je první skupina operace, operace bez skupiny leží přímo v prostředí. */
export const operationAddress = (environmentSlug, group, method, path) =>
  `${group === undefined ? `#${environmentSlug}` : groupAddress(environmentSlug, group)}/${method.toUpperCase()}${path}`;

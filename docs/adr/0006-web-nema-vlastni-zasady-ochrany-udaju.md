# Web nemá vlastní zásady ochrany osobních údajů

Web je čistá dokumentace API a sám nesbírá žádné osobní údaje. Návštěvníci na něj přicházejí z eD SHOPu (edshop.edsystem.cz), kde jsou všechny dokumenty společnosti včetně zásad ochrany osobních údajů; vlastní kapitola se zásadami by mezi dokumentací jen překážela. Stejně to dělá například API reference Stripe. Text zásad, který byl připravený pro web, je v `docs/archiv/ochrana-osobnich-udaju.md`.

## Důsledky

- Rozhodnutí stojí na tom, že web nic nesbírá: nenačítá nic z cizích domén (ADR 0002), návštěvník nezadává žádný token (ADR 0003) a v úložišti prohlížeče je jen barevný režim a jazyk ukázek kódu, které si návštěvník sám zvolil. `npm run verify` to kontroluje.
- Kdo přidá měření návštěvnosti, vložený obsah, zadávání tokenu nebo jiné ukládání v prohlížeči, otevírá i toto rozhodnutí: web pak potřebuje vlastní zásady a nejspíš i lištu cookies.

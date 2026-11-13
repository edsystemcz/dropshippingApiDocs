# Úvod

Dropshipping API propojí váš e-shop s eD system. Poskytuje katalog produktů se sklady a cenami, detail produktu a číselníky, umožňuje zakládat a sledovat objednávky B2C a B2B a ukazuje stav služby.

Podrobně je zatím popsaná synchronizace katalogu. Váš e-shop si přes API vyžádá vygenerování katalogového souboru s produkty, sklady a cenami. Soubor nevznikne hned: API nejprve vrátí `transactionId`, podle kterého e-shop zjišťuje stav jobu. Teprve po dokončení jobu API vrátí `fileName`, podle kterého e-shop katalogový soubor stáhne.

Jak získat přístup k API, popisuje kapitola [Autentizace](20-autentizace.md). Jak často katalog stahovat a jak zvolit měnu a zemi poplatků, popisuje průvodce synchronizací katalogu.

## Přehled operací

Synchronizace katalogu používá jen tyto operace. Adresa API je `{{baseUrl}}`.

| Účel                                       | Operace                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Založení jobu na vygenerování katalogu     | [`POST /products/catalog`](../operations/post__products_catalog.md)       |
| Zjištění stavu jobu podle `transactionId`  | [`GET /products/catalog`](../operations/get__products_catalog.md)         |
| Stažení katalogového souboru               | [`GET /files/{fileName}`](../operations/get__files_{fileName}.md)         |
| Získání číselníku zemí pro `countryIdFee`  | [`GET /codelists/countries`](../operations/get__codelists_countries.md)   |
| Získání číselníku měn pro `currencyId`     | [`GET /codelists/currencies`](../operations/get__codelists_currencies.md) |

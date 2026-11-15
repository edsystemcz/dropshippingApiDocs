Založí job, který vygeneruje katalogový soubor s produkty, sklady a cenami. Jak job sledovat a stáhnout jeho výsledek, popisuje průvodce v oddílu [Průběh jobu](../intro/30-synchronizace-katalogu.md#průběh-jobu).

## Kdy ji volat

Když potřebujete nový katalogový soubor. Kdy zakládat Full a kdy Update katalog, popisuje průvodce v oddílu [Plánování](../intro/30-synchronizace-katalogu.md#plánování).

## Na co si dát pozor

Které volitelné parametry posílat a proč je mezi Full a Update katalogem neměnit, popisuje průvodce v oddílu [Katalogový profil](../intro/30-synchronizace-katalogu.md#katalogový-profil). Pole `regionMask`, `regionZeroIncluded` a `canceled` se v popsané integraci neposílají.

Parametr `onStock` filtruje produkty podle skladové dostupnosti, a to u Full i Update katalogu:

| `onStock` | Které produkty katalog obsahuje                                                    |
| --------- | ---------------------------------------------------------------------------------- |
| neuvedeno | Aktivní produkty podle typu katalogu, bez filtru na skladovou dostupnost.          |
| `true`    | Jen produkty s `Quantity > 0`.                                                     |
| `false`   | Všechny aktivní produkty; produkty, které nejsou skladem, mají v XML `Quantity=0`. |

## Příklad

Update katalog s výchozím českým profilem:

```bash
curl -X POST '{{baseUrl}}/products/catalog' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"catalogType":"Update"}'
```

Další těla požadavku (Full katalog, filtr `onStock`, explicitní české nastavení a slovenský zákazník s cenami v EUR) si vyberete pod ukázkou kódu.

## Časté chyby

| Stavový kód | Kdy nastane                                                      | Co s tím                                                                                                      |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `400`       | Chybný požadavek, například neplatný JSON nebo neplatná hodnota. | Opravte tělo požadavku podle příkladů.                                                                        |
| `401`       | Token chybí, je neplatný nebo vypršel.                           | [Obnovte token](../intro/20-autentizace.md#obnova-tokenu) nebo získejte nový a volání zopakujte.              |
| `406`       | Požadavek není akceptovatelný.                                   | Pošlete hlavičky `Content-Type` a `Accept` jako v příkladu.                                                   |
| `500`       | Interní chyba serveru.                                           | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |
| `503`       | Služba je dočasně nedostupná.                                    | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |

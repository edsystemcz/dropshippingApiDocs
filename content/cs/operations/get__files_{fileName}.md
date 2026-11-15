Stáhne katalogový soubor, který vygeneroval job. Co soubor obsahuje, popisuje kapitola [XML struktura](../intro/40-xml-struktura.md).

## Kdy ji volat

Když job skončil úspěchem a zjištění stavu jobu vrátilo `fileName`, viz průvodce v oddílu [Konec jobu](../intro/30-synchronizace-katalogu.md#konec-jobu).

## Na co si dát pozor

- Typ katalogu z názvu souboru nepoznáte. Řiďte se hodnotou `catalogType`, se kterou jste job založili.
- Katalogový soubor je dostupný omezenou dobu: počítejte s 24 hodinami od vygenerování. Vygenerování nového souboru předchozí soubor nesmaže.
- Obsah vygenerovaného souboru se už nemění. Novější data přinese jen nový job založený operací [`POST /products/catalog`](post__products_catalog.md).

## Příklad

```bash
curl -X GET '{{baseUrl}}/files/pricelist_7_1000001_21052026134339_0d5a33c8-1fac-4272-8ef5-5aeb5c6addfa.ZIP' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/zip, application/octet-stream, */*' \
  --output catalog.zip
```

## Časté chyby

| Stavový kód | Kdy nastane                                                                     | Co s tím                                                                                                      |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `400`       | Chybný požadavek.                                                               | Porovnejte volání s příkladem.                                                                                |
| `401`       | Token chybí, je neplatný nebo vypršel.                                          | [Obnovte token](../intro/20-autentizace.md#obnova-tokenu) nebo získejte nový a volání zopakujte.              |
| `403`       | Neplatné volání, například chybí název souboru.                                 | Doplňte do adresy `fileName`.                                                                                 |
| `404`       | Soubor nebyl nalezen, například kvůli chybnému názvu nebo vypršení dostupnosti. | Zkontrolujte `fileName`. Když soubor už není dostupný, založte nový job.                                      |
| `500`       | Interní chyba serveru.                                                          | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |
| `503`       | Služba je dočasně nedostupná.                                                   | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |

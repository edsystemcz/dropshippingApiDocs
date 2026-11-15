Vrátí číselník zemí. Z něj zjistíte `id` země poplatků pro parametr `countryIdFee`.

## Kdy ji volat

Když potřebujete platnou hodnotu pro parametr `countryIdFee` operace [`POST /products/catalog`](post__products_catalog.md), tedy když chcete jinou zemi poplatků než výchozí. Jakou zemi poplatků zvolit, popisuje průvodce v oddílu [Měna a země poplatků](../intro/30-synchronizace-katalogu.md#měna-a-země-poplatků).

## Příklad

```bash
curl -X GET '{{baseUrl}}/codelists/countries?Take=1000&Skip=0' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

Příklad odpovědi ukazuje jen vybrané země.

## Časté chyby

| Stavový kód | Kdy nastane                            | Co s tím                                                                                                      |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `401`       | Token chybí, je neplatný nebo vypršel. | [Obnovte token](../intro/20-autentizace.md#obnova-tokenu) nebo získejte nový a volání zopakujte.              |
| `500`       | Interní chyba serveru.                 | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |
| `503`       | Služba je dočasně nedostupná.          | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |

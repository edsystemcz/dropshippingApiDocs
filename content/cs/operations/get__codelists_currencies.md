Vrátí číselník měn. Z něj zjistíte `id` měny, ve které chcete mít ceny v katalogu.

## Kdy ji volat

Když potřebujete platnou hodnotu pro parametr `currencyId` operace [`POST /products/catalog`](post__products_catalog.md), tedy když chcete ceny v jiné měně než výchozí. Jakou měnu zvolit, popisuje průvodce v oddílu [Měna a země poplatků](../intro/30-synchronizace-katalogu.md#měna-a-země-poplatků).

## Na co si dát pozor

Číselník vrací `id` jako text, například `"8"`. V těle požadavku `POST /products/catalog` se ale `currencyId` posílá jako celé číslo, tedy `8` bez uvozovek.

## Příklad

```bash
curl -X GET '{{baseUrl}}/codelists/currencies?Take=1000&Skip=0' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

Příklad odpovědi ukazuje jen vybrané měny.

## Časté chyby

| Stavový kód | Kdy nastane                            | Co s tím                                                                                                      |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `401`       | Token chybí, je neplatný nebo vypršel. | [Obnovte token](../intro/20-autentizace.md#obnova-tokenu) nebo získejte nový a volání zopakujte.              |
| `500`       | Interní chyba serveru.                 | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |
| `503`       | Služba je dočasně nedostupná.          | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |

Vrátí číselník měn. Z něj zjistíte `id` měny, ve které chcete mít ceny v katalogu.

## Kdy ji volat

Když potřebujete platnou hodnotu pro parametr `currencyId` operace `POST /products/catalog`. Pokud parametr neuvedete, použije se CZK a číselník volat nemusíte.

## Na co si dát pozor

- Číselník vrací `id` jako text, například `"8"`. V těle požadavku `POST /products/catalog` se ale `currencyId` posílá jako celé číslo, tedy `8` bez uvozovek.
- Operace vyžaduje stejný token jako ostatní volání Dropshipping API.

K čemu API slouží, shrnuje [úvod](../intro/10-uvod.md).

## Příklad

```bash
curl -X GET '{{baseUrl}}/codelists/currencies?Take=1000&Skip=0' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

Vybrané hodnoty:

| Měna         | `id` | `code` | `name` |
| ------------ | ---: | ------ | ------ |
| Česká koruna |  `8` | `CZK`  | `CZK`  |
| Euro         | `12` | `EUR`  | `EUR`  |

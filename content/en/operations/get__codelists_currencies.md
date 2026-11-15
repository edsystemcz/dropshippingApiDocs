Returns the currency codelist. Use it to find the `id` of the currency in which you want the catalog prices.

## When to call it

When you need a valid value for the `currencyId` parameter of [`POST /products/catalog`](post__products_catalog.md), that is, when you want prices in a currency other than the default. The guide describes which currency to choose in the [Currency and fee country](../intro/30-synchronizace-katalogu.md#currency-and-fee-country) section.

## What to watch out for

The codelist returns `id` as text, for example `"8"`. In the request body of `POST /products/catalog`, however, `currencyId` is sent as an integer, that is `8` without quotation marks.

## Example

```bash
curl -X GET '{{baseUrl}}/codelists/currencies?Take=1000&Skip=0' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

The response example shows only selected currencies.

## Common errors

| Status code | When it occurs                             | What to do                                                                                               |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `401`       | The token is missing, invalid, or expired. | [Renew the token](../intro/20-autentizace.md#renewing-a-token) or obtain a new one and repeat the call.  |
| `500`       | Internal server error.                     | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |
| `503`       | The service is temporarily unavailable.    | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |

Returns the country codelist. Use it to find the `id` of the fee country for the `countryIdFee` parameter.

## When to call it

When you need a valid value for the `countryIdFee` parameter of [`POST /products/catalog`](post__products_catalog.md), that is, when you want a fee country other than the default. The guide describes which fee country to choose in the [Currency and fee country](../intro/30-synchronizace-katalogu.md#currency-and-fee-country) section.

## Example

```bash
curl -X GET '{{baseUrl}}/codelists/countries?Take=1000&Skip=0' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

The response example shows only selected countries.

## Common errors

| Status code | When it occurs                             | What to do                                                                                               |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `401`       | The token is missing, invalid, or expired. | [Renew the token](../intro/20-autentizace.md#renewing-a-token) or obtain a new one and repeat the call.  |
| `500`       | Internal server error.                     | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |
| `503`       | The service is temporarily unavailable.    | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |

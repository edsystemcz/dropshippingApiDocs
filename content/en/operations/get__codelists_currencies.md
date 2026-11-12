Returns the currency code list. Use it to find the `id` of the currency in which you want the catalog prices.

## When to call it

When you need a valid value for the `currencyId` parameter of the `POST /products/catalog` operation. If you omit the parameter, CZK is used and you do not need to call the code list.

## What to watch out for

- The code list returns `id` as text, for example `"8"`. In the request body of `POST /products/catalog`, however, `currencyId` is sent as an integer, that is `8` without quotation marks.
- The operation requires the same token as other Dropshipping API calls.

For what the API is for, see the [introduction](../intro/10-uvod.md).

## Example

```bash
curl -X GET '{{baseUrl}}/codelists/currencies?Take=1000&Skip=0' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

Selected values:

| Currency     | `id` | `code` | `name` |
| ------------ | ---: | ------ | ------ |
| Czech koruna |  `8` | `CZK`  | `CZK`  |
| Euro         | `12` | `EUR`  | `EUR`  |

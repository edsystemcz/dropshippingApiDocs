Starts a job that generates a catalog file with products, stock levels and prices. The guide describes how to follow the job and download its result in the [Job workflow](../intro/30-synchronizace-katalogu.md#job-workflow) section.

## When to call it

When you need a new catalog file. The guide describes when to start a Full catalog and when an Update catalog in the [Scheduling](../intro/30-synchronizace-katalogu.md#scheduling) section.

## What to watch out for

The guide describes which optional parameters to send and why not to change them between the Full and Update catalogs in the [Catalog profile](../intro/30-synchronizace-katalogu.md#catalog-profile) section. The `regionMask`, `regionZeroIncluded` and `canceled` fields are not sent in the integration described here.

The `onStock` parameter filters products by stock availability, for both Full and Update catalogs:

| `onStock` | Which products the catalog contains                                                 |
| --------- | ----------------------------------------------------------------------------------- |
| omitted   | Active products according to the catalog type, without a stock availability filter. |
| `true`    | Only products with `Quantity > 0`.                                                  |
| `false`   | All active products; products that are out of stock have `Quantity=0` in the XML.   |

## Example

An Update catalog with the default Czech profile:

```bash
curl -X POST '{{baseUrl}}/products/catalog' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"catalogType":"Update"}'
```

You can pick other request bodies (a Full catalog, the `onStock` filter, explicit Czech settings and a Slovak customer with prices in EUR) below the code sample.

## Common errors

| Status code | When it occurs                                                 | What to do                                                                                               |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `400`       | Invalid request, for example invalid JSON or an invalid value. | Correct the request body according to the examples.                                                      |
| `401`       | The token is missing, invalid, or expired.                     | [Renew the token](../intro/20-autentizace.md#renewing-a-token) or obtain a new one and repeat the call.  |
| `406`       | The request is not acceptable.                                 | Send the `Content-Type` and `Accept` headers as in the example.                                          |
| `500`       | Internal server error.                                         | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |
| `503`       | The service is temporarily unavailable.                        | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |

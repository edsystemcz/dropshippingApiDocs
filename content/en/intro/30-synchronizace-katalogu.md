# Catalog synchronization guide

This guide describes how to keep the catalog in your e-shop up to date: the order in which the catalog operations are called, how the Full and Update catalogs differ, how to choose the catalog profile, the currency and the fee country, how often to start jobs and how to prepare for errors. It ends with a checklist to go through before deploying to production.

## Job workflow

1. Start a job with [`POST /products/catalog`](../operations/post__products_catalog.md). The API returns a `transactionId`; store it.
2. Repeatedly check the job status with [`GET /products/catalog`](../operations/get__products_catalog.md) and the `transactionId` parameter until the job ends. [Scheduling](#scheduling) describes how often to check.
3. When the job ends successfully, the response contains a `fileName`. Download the catalog file with [`GET /files/{fileName}`](../operations/get__files_{fileName}.md).
4. Extract the XML from the catalog file, process it and update your e-shop. The [XML structure](40-xml-struktura.md) chapter describes the content of the XML.

### When a job ends

The job status (`state`) tells you whether and how the job has ended:

| Outcome     | Job status                                                    | What to do                                                          |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Success     | `Generated`, or `Successful` with a populated `fileName`      | Download the catalog file using the `fileName`.                     |
| Failure     | `Error`, `Rejected`, `Cancelled`, `Deleted`                   | Log the `state`, `errorCode` and `errorMessage`. The job has ended. |
| Job running | All other statuses, including `Successful` without `fileName` | Keep checking.                                                      |

After a failure, you can start a new job, but limit repeated attempts so that you do not create an infinite loop. If the error persists, contact [support](50-chyby.md#support).

## Full and Update catalogs

A **Full catalog** contains all products according to the catalog profile. Your e-shop uses it for a full synchronization of products, stock levels and prices.

An **Update catalog** contains only the products that have changed relative to the differential baseline, meaning the latest Full catalog with the same catalog profile. A change is, for example:

- a change in stock availability,
- a price change,
- a change in fees,
- another change in the product data contained in the XML.

Therefore, before the first Update catalog for a given catalog profile, create a Full catalog.

An Update catalog is not the difference from the previous Update catalog. If you start several Update catalogs after the same Full catalog, each of them may again contain changes relative to the same differential baseline; processing must therefore be [idempotent](#idempotent-import). On the other hand, you cannot miss an Update catalog: it does not wait on the server as a separate package, it is generated only on request.

## Catalog profile

The catalog profile is the combination of the values and the presence of the optional `currencyId`, `countryIdFee` and `onStock` parameters in the body of the request that starts a job. Store the selected profile and keep it unchanged: start the Full catalog and all subsequent Update catalogs with the same profile; only `catalogType` changes.

- Both the parameter values and whether each parameter is specified or omitted must match. If a parameter was omitted from the Full catalog, also omit it from all subsequent Update catalogs.
- An omitted parameter and the same parameter with its default value are two different profiles. A request without `currencyId` and `countryIdFee` produces the same values as a request with `currencyId=8` and `countryIdFee=52`, but each of them has a different differential baseline. Therefore, do not automatically fill in omitted parameters with default values, and do not combine the two variants.
- Each profile has its own differential baseline. For example, the default Czech profile without optional parameters, a profile with the explicit values `currencyId=8` and `countryIdFee=52`, EUR with Czech fees, and a profile with `onStock=true` each have a separate baseline. For each profile in use, therefore, run a separate cycle with its own Full catalog and subsequent Update catalogs:

```text
Full(CZ default profile) -> Update(CZ default profile)
Full(SK / EUR profile)   -> Update(SK / EUR profile)
```

For routine Czech synchronization, send only `catalogType`, without optional parameters. Use the `onStock` parameter only for targeted stock availability checks, not for routine synchronization: with `onStock=true`, a product whose stock has dropped to zero does not appear in the Update catalog, and your e-shop does not learn about the zero stock level. Without `onStock`, your e-shop also receives zero stock levels.

## Currency and fee country

The currency of prices in the catalog is determined by `currencyId`, the fee country by `countryIdFee`. Both parameters are optional and independent of each other: the EUR currency alone does not mean Slovak fees. For example, you can request prices in EUR with Czech fees, or prices in CZK with Slovak fees. You will find valid IDs in the [currency](../operations/get__codelists_currencies.md) and [country](../operations/get__codelists_countries.md) codelists. The [Prices, fees and VAT](40-xml-struktura.md#prices-fees-and-vat) section describes which values in the XML the parameters change.

Recommended combinations:

| Scenario                                         | `currencyId` | `countryIdFee` | Result                                         |
| ------------------------------------------------ | -----------: | -------------: | ---------------------------------------------- |
| Routine Czech synchronization (default settings) |         omit |           omit | CZK, Czech fees and Czech VAT                  |
| Czech customer requesting EUR                    |         `12` |           `52` | EUR, Czech fees converted to EUR and Czech VAT |
| Slovak customer requesting EUR                   |         `12` |          `199` | EUR, Slovak fees and Slovak VAT                |

A Slovak customer must use `countryIdFee=199`. With EUR and an omitted `countryIdFee`, or with the value `52`, they receive Czech fees converted to EUR.

## Scheduling

| When                                                           | What                                                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Once a day, for example at night                               | For each catalog profile in use, start a Full catalog and perform a full synchronization from it.                                  |
| After the Full catalog is complete                             | Start creating Update catalogs with the same catalog profile. Apply each Update catalog as an upsert over the data in your e-shop. |
| Approximately every 15 minutes                                 | Start a new Update catalog, but only if the previous job has already [ended](#when-a-job-ends), successfully or not.               |
| Approximately every 2 minutes during a job, or less frequently | Check the job status with `GET /products/catalog`.                                                                                 |

These are recommendations, not strict technical limits. No separate rate limit has been set for this integration; nevertheless, observe reasonable intervals, especially when polling the job status.

### How long a job takes

Catalog generation typically takes several minutes, and considerably longer during busy periods, for example tens of minutes. There is no guaranteed maximum completion time. The catalog file is usually not ready in less than 2 minutes. Polling only checks the status; generation runs independently of it, and more frequent polling will not speed it up.

### Parallel jobs

The API allows multiple jobs to run at the same time. The recommendation to start the next Update catalog only after the previous job has ended has these reasons:

- the integration is easier to trace,
- both sides have less load,
- error states are easier to handle,
- imports in your e-shop follow each other clearly.

### Algorithm in pseudocode

```pseudo
// Default Czech profile: optional parameters are intentionally omitted.
defaultCzProfile = {}

// Separate Slovak profile with prices in EUR.
skEurProfile = {
    "currencyId": 12,
    "countryIdFee": 199
}

// End of a job: success, failure, otherwise the job is running.
function isSuccess(status):
    return status.state == "Generated"
        or (status.state == "Successful" and status.fileName is not empty)

function isFailure(status):
    return status.state in ["Error", "Rejected", "Cancelled", "Deleted"]

function runCatalog(catalogType, catalogProfile):
    token = getOrRefreshToken()

    body = clone(catalogProfile)
    body["catalogType"] = catalogType

    response = POST /products/catalog with body

    transactionId = response.transactionId
    log(transactionId, catalogType, body, "created")

    while true:
        token = getOrRefreshToken()
        statusResponse = GET /products/catalog?transactionId=transactionId
        status = statusResponse[0]
        log(transactionId, status.state, status.stateChanged, status.fileName)

        if isSuccess(status):
            zip = GET /files/{status.fileName}
            xml = unzipSingleXml(zip)
            importProducts(xml)
            log(transactionId, status.fileName, "imported")
            return success

        if isFailure(status):
            logError(transactionId, status.state, status.errorCode, status.errorMessage)
            return failure

        sleep(120 seconds)

// Within a single cycle, only catalogType changes.
runCatalog("Full", defaultCzProfile)
runCatalog("Update", defaultCzProfile)

// A different profile has its own Full and its own subsequent Update.
runCatalog("Full", skEurProfile)
runCatalog("Update", skEurProfile)
```

## Resilience to errors

### Idempotent import

The XML import should be idempotent: processing the same catalog file repeatedly must not damage the data in your e-shop.

- Match products by the stable identifier your e-shop uses, typically `ProductCode` or `ProductId`.
- Update values using an upsert.
- Keep a record of processed files by `fileName`.
- Prevent duplicate side effects when the same file is downloaded repeatedly.

### Verifying the downloaded file

The API does not provide a checksum, ETag or another separate verification mechanism. After downloading, therefore, verify that:

- the download returned the HTTP status `200`,
- the file can be extracted as a ZIP,
- the ZIP contains exactly one XML file,
- the XML can be parsed without errors.

### Retrying after errors

| Situation                                                           | Recommendation                                                                                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The token has expired, the API returns `401`                        | Obtain a new token or [renew](20-autentizace.md#renewing-a-token) it, and repeat the request.                                                         |
| Temporary `500` or `503` error when checking the job status         | Repeat the request after a delay.                                                                                                                     |
| Downloading or verifying the catalog file fails                     | Download the same `fileName` again.                                                                                                                   |
| The catalog file still cannot be downloaded after retries           | Start a new job. If the problem persists, contact [support](50-chyby.md#support).                                                                     |
| Timeout after `POST /products/catalog` without receiving a response | It is not certain whether the job was created; repeating the request may start a parallel job. Handle this in your logic to prevent an infinite loop. |

### Logging

Log at least:

- the time the job was started,
- `catalogType`,
- the exact body of the request that started the job, including which of the `currencyId`, `countryIdFee` and `onStock` parameters were specified and which were omitted,
- `transactionId`, the intermediate `state`, `stateChanged` and `fileName`,
- HTTP status codes,
- the time the catalog file was downloaded,
- the import result,
- the number of products processed,
- any `errorCode`, `errorMessage` and `infoMessage`.

Such logging greatly simplifies finding the cause when the catalog file takes a long time to generate, the job ends with an error, or expected products are not updated in your e-shop.

## Pre-deployment checklist

Before deploying to production, verify:

- We can [obtain a token](20-autentizace.md#obtaining-a-token).
- We can renew the token or obtain a new one after it expires.
- We can start a Full catalog with a routine request body containing only `catalogType`.
- We know the default settings (CZK, Czech fees) and know when to use `currencyId` and `countryIdFee`.
- We can obtain valid IDs from `/codelists/currencies` and `/codelists/countries`.
- We use exactly the same [catalog profile](#catalog-profile) for the Full catalog and the subsequent Update catalogs: the same `currencyId`, `countryIdFee` and `onStock`.
- Within a single profile, the optional parameters are either always specified or always omitted.
- We have created a Full catalog as the differential baseline for every catalog profile in use.
- We do not use `onStock` for routine synchronization, so that zero stock levels are also transferred.
- We use `countryIdFee=199` for Slovak fees; the EUR currency alone does not change the fee country.
- We store the `transactionId`.
- We can check the job status.
- We correctly recognize [when a job ends](#when-a-job-ends).
- We can download the catalog file using the `fileName`.
- We verify that the ZIP contains exactly one XML file.
- We can process the [XML](40-xml-struktura.md) in `utf-8` encoding.
- We correctly convert the decimal comma.
- We use `PriceWithFee` as the price excluding VAT and including fees.
- We verify that `CurrencyCode` and `VAT` correspond to the requested currency and fee country.
- We detect [discontinued products](40-xml-struktura.md#discontinued-products) by comparing the current and previous Full catalogs.
- We do not use `onStock=true` to detect discontinued products.
- The import is idempotent.
- We can retry after temporary errors.
- We log the `transactionId`, `state`, `fileName` and import result.

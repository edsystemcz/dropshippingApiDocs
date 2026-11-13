# Introduction

The Dropshipping API connects your e-shop with eD system. It provides the product catalog with stock levels and prices, product details and codelists, lets you create and track B2C and B2B orders, and reports the service status.

So far, this documentation describes catalog synchronization in detail. Through the API, your e-shop requests the generation of a catalog file with products, stock levels and prices. The file is not created immediately: the API first returns a `transactionId`, which your e-shop uses to check the status of the job. Only after the job is complete does the API return a `fileName`, which your e-shop uses to download the catalog file.

The [Authentication](20-autentizace.md) chapter describes how to get access to the API. The catalog synchronization guide describes how often to download the catalog and how to choose the currency and the fee country.

## Overview of operations

Catalog synchronization uses only the following operations. The API address is `{{baseUrl}}`.

| Purpose                                         | Operation                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| Starting a job that generates the catalog       | [`POST /products/catalog`](../operations/post__products_catalog.md)       |
| Checking the job status by `transactionId`      | [`GET /products/catalog`](../operations/get__products_catalog.md)         |
| Downloading the catalog file                    | [`GET /files/{fileName}`](../operations/get__files_{fileName}.md)         |
| Getting the country codelist for `countryIdFee` | [`GET /codelists/countries`](../operations/get__codelists_countries.md)   |
| Getting the currency codelist for `currencyId`  | [`GET /codelists/currencies`](../operations/get__codelists_currencies.md) |

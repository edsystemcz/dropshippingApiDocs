# Introduction

Through the Dropshipping API, you request the generation of a catalog file with products, stock levels and prices. Generation is asynchronous: the API first returns a `transactionId`, which you use to check the status of the job. Once the job is complete, the API returns a `fileName`, which you use to download the catalog file.

The API address is `{{baseUrl}}`.

## Overview of operations

| Purpose                                          | Operation                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| Getting the currency code list for `currencyId`  | [`GET /codelists/currencies`](../operations/get__codelists_currencies.md) |

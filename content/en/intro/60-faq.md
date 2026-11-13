# Frequently asked questions

## Do we have to download the Full catalog every time?

No. The [Scheduling](30-synchronizace-katalogu.md#scheduling) section of the guide describes how often to start Full and Update catalogs.

## Is an Update catalog the difference from the latest Update catalog?

No. The [Full and Update catalogs](30-synchronizace-katalogu.md#full-and-update-catalogs) section of the guide describes what an Update catalog is calculated against.

## Can we miss an Update catalog?

No. The [Full and Update catalogs](30-synchronizace-katalogu.md#full-and-update-catalogs) section of the guide explains why not.

## Does more frequent polling speed up file generation?

No. The [How long a job takes](30-synchronizace-katalogu.md#how-long-a-job-takes) section of the guide explains why not.

## Can we download the same file repeatedly?

Yes, as long as the catalog file is available. The description of the [catalog file download](../operations/get__files_{fileName}.md) operation states for how long.

## Should we download the same fileName again for a new update?

No. The description of the [catalog file download](../operations/get__files_{fileName}.md) operation states where newer data comes from.

## How do we detect discontinued products?

By comparing two Full catalogs. The [Discontinued products](40-xml-struktura.md#discontinued-products) section of the XML structure chapter describes the procedure.

## Should we use onStock for routine synchronization?

No. The [Catalog profile](30-synchronizace-katalogu.md#catalog-profile) section of the guide explains why not.

## How do we set a different currency or fee country?

With optional parameters in the body of the request that starts a job. The [Currency and fee country](30-synchronizace-katalogu.md#currency-and-fee-country) section of the guide describes which parameters they are and how to choose them.

## Which settings should a Slovak customer with prices in EUR use?

The [Currency and fee country](30-synchronizace-katalogu.md#currency-and-fee-country) section of the guide lists the recommended combinations of currency and fee country, including the Slovak one.

## What are the default settings without currencyId and countryIdFee?

The [Currency and fee country](30-synchronizace-katalogu.md#currency-and-fee-country) section of the guide states the default settings. The [Catalog profile](30-synchronizace-katalogu.md#catalog-profile) section explains why not to combine them with explicit default values.

## Can we use different parameters in an Update catalog than in the previous Full catalog?

We do not recommend it. The [Catalog profile](30-synchronizace-katalogu.md#catalog-profile) section of the guide explains why.

## Does the API maintain a separate differential baseline for each catalog profile?

Yes. The [Catalog profile](30-synchronizace-katalogu.md#catalog-profile) section of the guide describes what follows from this.

## Is a file checksum available?

No. The [Verifying the downloaded file](30-synchronizace-katalogu.md#verifying-the-downloaded-file) section of the guide describes how to check that the file is fine.

## Is there a rate limit?

Not a separate one. The [Scheduling](30-synchronizace-katalogu.md#scheduling) section of the guide lists the recommended intervals.

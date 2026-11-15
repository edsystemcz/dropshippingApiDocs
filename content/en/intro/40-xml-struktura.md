# XML structure

The catalog file is a ZIP that always contains exactly one XML file in `utf-8` encoding. The XML has the `Products` root element, which contains a `Product` element for each product.

## Product example

```xml
<?xml version="1.0" encoding="utf-8"?>
<Products>
  <Product>
    <ProductId>1234567</ProductId>
    <ProductCode>7654321</ProductCode>
    <EAN>2001234567893</EAN>
    <PartNumber>AB123CD#XYZ</PartNumber>
    <Quantity>9,00</Quantity>
    <Price>14790,0000</Price>
    <Fees>
      <AOFee>33,0000</AOFee>
      <SNCFee>14,0000</SNCFee>
    </Fees>
    <PriceWithFee>14837,0000</PriceWithFee>
    <CurrencyCode>CZK</CurrencyCode>
    <VAT>21,00</VAT>
    <Commodity>
      <CommodityCode>NTB</CommodityCode>
      <CommodityName>EXAMPLE NOTEBOOKS</CommodityName>
    </Commodity>
    <ProducerName>Example Inc.</ProducerName>
    <Canceled>False</Canceled>
    <MultipleQuantity />
  </Product>
</Products>
```

## Field descriptions

| XML element               | Type and format              | Description                                                                         |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `ProductId`               | integer                      | Internal product ID. It is unique.                                                  |
| `ProductCode`             | string or integer            | Product code. It is unique.                                                         |
| `EAN`                     | string                       | EAN. May be empty.                                                                  |
| `PartNumber`              | string                       | Part number, meaning the manufacturer's designation.                                |
| `Quantity`                | decimal with a decimal comma | Stock quantity. Process it as a decimal number.                                     |
| `Price`                   | decimal with a decimal comma | Price excluding VAT and some fees.                                                  |
| `Fees/AOFee`              | decimal with a decimal comma | Copyright fee.                                                                      |
| `Fees/SNCFee`             | decimal with a decimal comma | Recycling fee.                                                                      |
| `PriceWithFee`            | decimal with a decimal comma | Price excluding VAT, including fees.                                                |
| `CurrencyCode`            | string                       | Currency code of the monetary values, for example `CZK` or `EUR`.                   |
| `VAT`                     | decimal with a decimal comma | VAT rate as a percentage, for example `21,00` or `23,00`.                           |
| `Commodity/CommodityCode` | string                       | Commodity code.                                                                     |
| `Commodity/CommodityName` | string                       | Commodity name.                                                                     |
| `ProducerName`            | string                       | Manufacturer name.                                                                  |
| `Canceled`                | boolean as text              | Always `False`, see [Discontinued products](#discontinued-products).                |
| `MultipleQuantity`        | string or empty element      | Typically empty in current data. Do not base business logic on it.                  |

## Number formats

Numeric values in the XML use a decimal comma, for example:

```text
9,00
14790,0000
21,00
```

A system that expects a decimal point must convert the values:

```text
"14790,0000" -> 14790.0000
```

## Prices, fees and VAT

- The currency of all monetary values (`Price`, `AOFee`, `SNCFee` and `PriceWithFee`), and therefore also `CurrencyCode`, is determined by the `currencyId` parameter.
- The fee country (`countryIdFee`) determines the fees and the VAT rate. It may therefore change `Price`, `AOFee`, `SNCFee`, `PriceWithFee` and `VAT`.
- VAT is shown separately in the `VAT` element.
- For sales and purchase price updates, we recommend `PriceWithFee`.

The [Currency and fee country](30-synchronizace-katalogu.md#currency-and-fee-country) section of the guide describes how to choose the currency and the fee country. This is how the values of one product (`ProductId=2345678`) change:

| Fee country / currency |    `Price` |  `AOFee` | `SNCFee` | `PriceWithFee` |   `VAT` |
| ---------------------- | ---------: | -------: | -------: | -------------: | ------: |
| CZ / CZK               | `359,5000` | `0,0000` | `1,5000` |     `361,0000` | `21,00` |
| CZ / EUR               |  `14,8321` | `0,0000` | `0,0619` |      `14,8940` | `21,00` |
| SK / CZK               | `359,8546` | `0,0000` | `3,1454` |     `363,0000` | `23,00` |
| SK / EUR               |  `14,8319` | `0,0000` | `0,1298` |      `14,9616` | `23,00` |

For a particular product, a fee may be zero. This does not mean that the fee country does not generally affect that type of fee.

## Discontinued products

The `Canceled` element is technically present in the XML, but in the catalog it always has the value `False`:

```xml
<Canceled>False</Canceled>
```

The API does not return the value `True`; do not use the element in business logic. Products that eD system discontinues in the ERP do not get into the catalog at all: they disappear from the catalog file.

You can therefore detect discontinued products only by comparing two Full catalogs:

1. Start the Full catalogs for the comparison with `catalogType` only, without the optional `currencyId`, `countryIdFee` and `onStock` parameters.
2. Generate a Full catalog and store the list of its products.
3. Later, generate another Full catalog with exactly the same profile.
4. Compare the previous and the current Full catalog.
5. Products that were in the previous Full catalog and are missing from the current one are discontinued; deactivate them in your e-shop.

For the comparison, use `ProductId` or `ProductCode`, depending on which identifier you use to match products in your e-shop.

Do not use catalogs with `onStock=true` to detect discontinued products: a product may disappear from them simply because it is currently out of stock.

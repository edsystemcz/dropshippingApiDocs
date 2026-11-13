# XML struktura

Katalogový soubor je ZIP, který obsahuje vždy právě jeden XML soubor v kódování `utf-8`. XML má kořenový element `Products` a v něm pro každý produkt element `Product`.

## Ukázka produktu

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

## Popis polí

| XML element               | Typ a formát                | Popis                                                                                    |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `ProductId`               | integer                     | Interní ID produktu. Je unikátní.                                                        |
| `ProductCode`             | string nebo integer         | Kód produktu. Je unikátní.                                                               |
| `EAN`                     | string                      | EAN. Může být prázdný.                                                                   |
| `PartNumber`              | string                      | Part number, tedy výrobní označení.                                                      |
| `Quantity`                | decimal s desetinnou čárkou | Skladové množství. Zpracovávejte ho jako desetinné číslo.                                |
| `Price`                   | decimal s desetinnou čárkou | Cena bez DPH a bez některých poplatků.                                                   |
| `Fees/AOFee`              | decimal s desetinnou čárkou | Autorský poplatek.                                                                       |
| `Fees/SNCFee`             | decimal s desetinnou čárkou | Recyklační poplatek.                                                                     |
| `PriceWithFee`            | decimal s desetinnou čárkou | Cena bez DPH, včetně poplatků.                                                           |
| `CurrencyCode`            | string                      | Kód měny peněžních hodnot, například `CZK` nebo `EUR`.                                   |
| `VAT`                     | decimal s desetinnou čárkou | Sazba DPH v procentech, například `21,00` nebo `23,00`.                                  |
| `Commodity/CommodityCode` | string                      | Kód komodity.                                                                            |
| `Commodity/CommodityName` | string                      | Název komodity.                                                                          |
| `ProducerName`            | string                      | Název výrobce.                                                                           |
| `Canceled`                | boolean jako text           | Vždy `False`, viz [Vyřazené produkty](#vyřazené-produkty).                               |
| `MultipleQuantity`        | string nebo prázdný element | V současných datech je typicky prázdný. Obchodní logiku na něm nestavte.                 |

## Číselné formáty

Číselné hodnoty mají v XML desetinnou čárku, například:

```text
9,00
14790,0000
21,00
```

Systém, který očekává desetinnou tečku, musí hodnoty převést:

```text
"14790,0000" -> 14790.0000
```

## Ceny, poplatky a DPH

- Měnu všech peněžních hodnot (`Price`, `AOFee`, `SNCFee` a `PriceWithFee`) a tím i `CurrencyCode` určuje parametr `currencyId`.
- Země poplatků (`countryIdFee`) určuje poplatky a sazbu DPH. Může tak změnit `Price`, `AOFee`, `SNCFee`, `PriceWithFee` i `VAT`.
- DPH je uvedená samostatně v elementu `VAT`.
- Pro aktualizaci prodejních a nákupních cen doporučujeme `PriceWithFee`.

Jak měnu a zemi poplatků zvolit, popisuje průvodce v oddílu [Měna a země poplatků](30-synchronizace-katalogu.md#měna-a-země-poplatků). Takto se mění hodnoty jednoho produktu (`ProductId=2345678`):

| Země poplatků / měna |    `Price` |  `AOFee` | `SNCFee` | `PriceWithFee` |   `VAT` |
| -------------------- | ---------: | -------: | -------: | -------------: | ------: |
| CZ / CZK             | `359,5000` | `0,0000` | `1,5000` |     `361,0000` | `21,00` |
| CZ / EUR             |  `14,8321` | `0,0000` | `0,0619` |      `14,8940` | `21,00` |
| SK / CZK             | `359,8546` | `0,0000` | `3,1454` |     `363,0000` | `23,00` |
| SK / EUR             |  `14,8319` | `0,0000` | `0,1298` |      `14,9616` | `23,00` |

U konkrétního produktu může být některý poplatek nulový. To neznamená, že země poplatků daný druh poplatku obecně neovlivňuje.

## Vyřazené produkty

Element `Canceled` je v XML technicky přítomný, ale v katalogu má vždy hodnotu `False`:

```xml
<Canceled>False</Canceled>
```

Hodnotu `True` API nevrací a element v obchodní logice nepoužívejte. Produkty, které eD system v ERP vyřadí, se do katalogu vůbec nedostanou: z katalogového souboru zmizí.

Vyřazené produkty proto poznáte jen porovnáním dvou Full katalogů:

1. Zvolte [běžný katalogový profil](30-synchronizace-katalogu.md#katalogový-profil) bez `onStock=true`.
2. Vygenerujte Full katalog a uložte si seznam jeho produktů.
3. Později vygenerujte další Full katalog se zcela stejným profilem.
4. Porovnejte předchozí a aktuální Full katalog.
5. Produkty, které byly v předchozím Full katalogu a v aktuálním chybí, jsou vyřazené; v e-shopu je deaktivujte.

K porovnání použijte `ProductId` nebo `ProductCode`, podle toho, kterým identifikátorem párujete produkty v e-shopu.

Katalogy s `onStock=true` k hledání vyřazených produktů nepoužívejte: produkt z nich může zmizet jen proto, že právě není skladem.

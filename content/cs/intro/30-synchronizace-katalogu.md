# Průvodce synchronizací katalogu

Průvodce popisuje, jak udržovat katalog v e-shopu aktuální: jak jdou operace katalogu za sebou, čím se liší Full a Update katalog, jak zvolit katalogový profil, měnu a zemi poplatků, jak často joby zakládat a jak se připravit na chyby. Na konci je checklist před nasazením do produkce.

## Průběh jobu

1. Založte job operací [`POST /products/catalog`](../operations/post__products_catalog.md). API vrátí `transactionId`; uložte si ho.
2. Opakovaně se ptejte na stav jobu operací [`GET /products/catalog`](../operations/get__products_catalog.md) s parametrem `transactionId`, dokud job neskončí. Jak často se ptát, popisuje [Plánování](#plánování).
3. Když job skončí úspěchem, odpověď obsahuje `fileName`. Katalogový soubor stáhněte operací [`GET /files/{fileName}`](../operations/get__files_{fileName}.md).
4. Rozbalte z katalogového souboru XML, zpracujte ho a aktualizujte e-shop. Obsah XML popisuje kapitola [XML struktura](40-xml-struktura.md).

### Konec jobu

Podle stavu jobu (`state`) poznáte, jestli job skončil a jak:

| Výsledek | Stav jobu                                             | Co dělat                                                      |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Úspěch   | `Generated`, nebo `Successful` s vyplněným `fileName` | Stáhnout katalogový soubor podle `fileName`.                  |
| Neúspěch | `Error`, `Rejected`, `Cancelled`, `Deleted`           | Zalogovat `state`, `errorCode` a `errorMessage`. Job skončil. |
| Job běží | Všechny ostatní stavy, i `Successful` bez `fileName`  | Ptát se dál.                                                  |

Po neúspěchu můžete založit nový job, ale opakované zakládání omezte, aby nevznikla nekonečná smyčka. Pokud chyba přetrvává, obraťte se na [podporu](50-chyby.md#podpora).

## Full a Update katalog

**Full katalog** obsahuje všechny produkty podle katalogového profilu. E-shop z něj provede úplnou synchronizaci produktů, skladů a cen.

**Update katalog** obsahuje jen produkty, které se změnily proti rozdílovému základu, tedy proti nejnovějšímu Full katalogu se stejným katalogovým profilem. Změnou je například:

- změna skladové dostupnosti,
- změna ceny,
- změna poplatků,
- jiná změna v produktových datech, která XML obsahuje.

Před prvním Update katalogem pro daný katalogový profil proto vytvořte Full katalog.

Update katalog není rozdíl proti předchozímu Update katalogu. Když po stejném Full katalogu založíte více Update katalogů, každý může znovu obsahovat změny proti stejnému rozdílovému základu; zpracování proto musí být [idempotentní](#idempotentní-import). O žádný Update katalog naopak nepřijdete: nečeká na serveru jako samostatný balíček, vzniká až na vyžádání.

## Katalogový profil

Katalogový profil je kombinace hodnot a přítomnosti volitelných parametrů `currencyId`, `countryIdFee` a `onStock` v těle požadavku na založení jobu. Zvolený profil si uložte jako neměnný: Full katalog i všechny navazující Update katalogy zakládejte se stejným profilem, mění se jen `catalogType`.

- Shodovat se musí hodnoty parametrů i to, jestli jsou uvedené, nebo vynechané. Parametr vynechaný ve Full katalogu vynechávejte i ve všech navazujících Update katalozích.
- Vynechaný parametr a tentýž parametr s výchozí hodnotou jsou dva různé profily. Požadavek bez `currencyId` a `countryIdFee` dá stejné hodnoty jako požadavek s `currencyId=8` a `countryIdFee=52`, ale každý z nich má jiný rozdílový základ. Vynechané parametry proto nedoplňujte automaticky výchozími hodnotami a obě varianty nekombinujte.
- Každý profil má vlastní rozdílový základ. Samostatný základ má například výchozí český profil bez volitelných parametrů, profil s explicitními `currencyId=8` a `countryIdFee=52`, EUR s českými poplatky i profil s `onStock=true`. Pro každý používaný profil proto provozujte samostatný cyklus s vlastním Full katalogem a navazujícími Update katalogy:

```text
Full(CZ výchozí profil) -> Update(CZ výchozí profil)
Full(SK / EUR profil)   -> Update(SK / EUR profil)
```

Pro běžnou českou synchronizaci posílejte jen `catalogType`, bez volitelných parametrů. Parametr `onStock` používejte jen pro cílené ověření skladové dostupnosti, ne pro běžnou synchronizaci: s `onStock=true` se produkt, jehož zásoba klesla na nulu, v Update katalogu neobjeví a e-shop se o nulovém skladovém stavu nedozví. Bez `onStock` dostane e-shop i nulové skladové stavy.

## Měna a země poplatků

Měnu cen v katalogu určuje `currencyId`, zemi poplatků `countryIdFee`. Oba parametry jsou volitelné a navzájem nezávislé: měna EUR sama o sobě neznamená slovenské poplatky. Lze tak požadovat například ceny v EUR s českými poplatky, nebo ceny v CZK se slovenskými poplatky. Platná ID najdete v číselníku [měn](../operations/get__codelists_currencies.md) a [zemí](../operations/get__codelists_countries.md). Které hodnoty v XML parametry mění, popisuje oddíl [Ceny, poplatky a DPH](40-xml-struktura.md#ceny-poplatky-a-dph).

Doporučené kombinace:

| Situace                                       | `currencyId` | `countryIdFee` | Výsledek                                          |
| --------------------------------------------- | -----------: | -------------: | ------------------------------------------------- |
| Běžná česká synchronizace (výchozí nastavení) |     vynechat |       vynechat | CZK, české poplatky a česká DPH                   |
| Český zákazník požadující EUR                 |         `12` |           `52` | EUR, české poplatky přepočtené do EUR a česká DPH |
| Slovenský zákazník požadující EUR             |         `12` |          `199` | EUR, slovenské poplatky a slovenská DPH           |

Slovenský zákazník má použít `countryIdFee=199`. S EUR a vynechaným `countryIdFee`, nebo s hodnotou `52`, dostane české poplatky přepočtené do EUR.

## Plánování

| Kdy                                                  | Co                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Jednou denně, například v noci                       | Pro každý používaný katalogový profil založit Full katalog a provést z něj úplnou synchronizaci.                               |
| Po dokončení Full katalogu                           | Začít zakládat Update katalogy se stejným katalogovým profilem. Každý Update katalog aplikovat jako upsert nad daty v e-shopu. |
| Přibližně každých 15 minut                           | Založit nový Update katalog, ale jen pokud předchozí job už [skončil](#konec-jobu), úspěchem i neúspěchem.                     |
| Přibližně každé 2 minuty během jobu, nebo méně často | Zjistit stav jobu operací `GET /products/catalog`.                                                                             |

Jsou to doporučení, ne pevné technické limity. Samostatný rate limit pro tuto integraci stanovený není; přesto dodržujte rozumné intervaly, zejména při dotazování na stav jobu.

### Jak dlouho job trvá

Generování katalogu běžně trvá několik minut, ve vytížených obdobích i výrazně déle, například desítky minut. Pevný maximální čas dokončení zaručený není. Katalogový soubor obvykle nevznikne dřív než za 2 minuty. Dotaz jen zjišťuje stav, generování běží nezávisle na něm; častější dotazování ho neurychlí.

### Souběžné joby

API dovoluje, aby běželo více jobů současně. Doporučení zakládat další Update katalog až po konci předchozího jobu má tyto důvody:

- provoz se snáz dohledá,
- obě strany mají menší zátěž,
- chybové stavy se řeší snáz,
- importy v e-shopu na sebe přehledně navazují.

### Algoritmus v pseudokódu

```pseudo
// Výchozí český profil: volitelné parametry jsou záměrně vynechané.
defaultCzProfile = {}

// Samostatný slovenský profil s cenami v EUR.
skEurProfile = {
    "currencyId": 12,
    "countryIdFee": 199
}

// Konec jobu: úspěch, neúspěch, jinak job běží.
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

// V rámci jednoho cyklu se mění jen catalogType.
runCatalog("Full", defaultCzProfile)
runCatalog("Update", defaultCzProfile)

// Jiný profil má vlastní Full a vlastní navazující Update.
runCatalog("Full", skEurProfile)
runCatalog("Update", skEurProfile)
```

## Odolnost proti chybám

### Idempotentní import

Import XML má být idempotentní: opakované zpracování téhož katalogového souboru nesmí poškodit data v e-shopu.

- Produkty párujte podle stabilního identifikátoru, který e-shop používá, typicky `ProductCode` nebo `ProductId`.
- Hodnoty aktualizujte metodou upsert.
- Zpracované soubory si evidujte podle `fileName`.
- Při opakovaném stažení téhož souboru zabraňte duplicitním vedlejším efektům.

### Kontrola staženého souboru

API neposkytuje kontrolní součet, ETag ani jiný samostatný kontrolní mechanismus. Po stažení proto ověřte, že:

- stažení vrátilo HTTP status `200`,
- soubor jde rozbalit jako ZIP,
- ZIP obsahuje právě jeden XML soubor,
- XML jde bez chyby zpracovat parserem.

### Opakování při chybách

| Situace                                                    | Doporučení                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Token vypršel, API vrací `401`                             | Získat nový token nebo ho [obnovit](20-autentizace.md#obnova-tokenu) a požadavek zopakovat.                                        |
| Dočasná chyba `500` nebo `503` při dotazu na stav jobu     | Dotaz zopakovat s časovým odstupem.                                                                                                |
| Stažení nebo kontrola katalogového souboru selže           | Stáhnout znovu stejný `fileName`.                                                                                                  |
| Katalogový soubor nejde stáhnout ani po opakování          | Založit nový job. Pokud problém přetrvává, obrátit se na [podporu](50-chyby.md#podpora).                                           |
| Po `POST /products/catalog` vypršel čas a odpověď nepřišla | Není jisté, jestli job vznikl; opakovaný požadavek může založit souběžný job. Logiku ošetřete tak, aby nevznikla nekonečná smyčka. |

### Logování

Logujte aspoň:

- čas založení jobu,
- `catalogType`,
- přesné tělo požadavku na založení jobu, včetně toho, které z parametrů `currencyId`, `countryIdFee` a `onStock` byly uvedené a které vynechané,
- `transactionId`, průběžný `state`, `stateChanged` a `fileName`,
- HTTP status kódy,
- čas stažení katalogového souboru,
- výsledek importu,
- počet zpracovaných produktů,
- případné `errorCode`, `errorMessage` a `infoMessage`.

Takové logování výrazně usnadní hledání příčiny, když se katalogový soubor generuje dlouho, job skončí chybou nebo se v e-shopu neaktualizují očekávané produkty.

## Checklist před nasazením

Před nasazením do produkce ověřte:

- Umíme [získat token](20-autentizace.md#získání-tokenu).
- Po vypršení umíme token obnovit nebo získat nový.
- Umíme založit Full katalog s běžným tělem požadavku, které obsahuje jen `catalogType`.
- Známe výchozí nastavení (CZK, české poplatky) a víme, kdy použít `currencyId` a `countryIdFee`.
- Umíme získat platná ID z `/codelists/currencies` a `/codelists/countries`.
- Pro Full katalog a navazující Update katalogy používáme zcela stejný [katalogový profil](#katalogový-profil): stejné `currencyId`, `countryIdFee` a `onStock`.
- Volitelné parametry jsou v rámci jednoho profilu buď vždy uvedené, nebo vždy vynechané.
- Pro každý používaný katalogový profil máme vytvořený Full katalog jako rozdílový základ.
- Pro běžnou synchronizaci nepoužíváme `onStock`, aby se přenášely i nulové skladové stavy.
- Pro slovenské poplatky používáme `countryIdFee=199`; samotná měna EUR zemi poplatků nemění.
- Ukládáme `transactionId`.
- Umíme se ptát na stav jobu.
- Správně poznáme [konec jobu](#konec-jobu).
- Umíme stáhnout katalogový soubor podle `fileName`.
- Ověřujeme, že ZIP obsahuje právě jeden XML soubor.
- Umíme zpracovat [XML](40-xml-struktura.md) v kódování `utf-8`.
- Správně převádíme desetinnou čárku.
- Jako cenu bez DPH včetně poplatků používáme `PriceWithFee`.
- Ověřujeme, že `CurrencyCode` a `VAT` odpovídají požadované měně a zemi poplatků.
- [Vyřazené produkty](40-xml-struktura.md#vyřazené-produkty) poznáme porovnáním aktuálního a předchozího Full katalogu.
- Pro hledání vyřazených produktů nepoužíváme `onStock=true`.
- Import je idempotentní.
- Dočasné chyby umíme zopakovat.
- Logujeme `transactionId`, `state`, `fileName` a výsledek importu.

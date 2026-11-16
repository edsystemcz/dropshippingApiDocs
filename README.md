# Dokumentace Dropshipping API

Zdroj veřejného dokumentačního webu Dropshipping API společnosti eD system:

- česky: <https://edsystemcz.github.io/dropshippingApiDocs/>
- anglicky: <https://edsystemcz.github.io/dropshippingApiDocs/en/>

Návod je pro správce textů, tedy pro toho, kdo doplňuje a upravuje texty na webu. Programovat k tomu není potřeba: popis nové operace je jeden textový soubor, který se vytvoří přímo na GitHubu. Pojmy v textech pište podle [slovníku](GLOSSARY.md).

## Obsah

- [Jak web vzniká](#jak-web-vzniká)
- [Přidání popisu operace krok za krokem](#přidání-popisu-operace-krok-za-krokem)
- [Jak pojmenovat soubor](#jak-pojmenovat-soubor)
- [Šablona popisu operace](#šablona-popisu-operace)
- [Zástupné symboly prostředí](#zástupné-symboly-prostředí)
- [Odkazy mezi texty](#odkazy-mezi-texty)
- [Úprava existujícího textu](#úprava-existujícího-textu)
- [Anglická verze](#anglická-verze)
- [Výpis pokrytí a varování](#výpis-pokrytí-a-varování)
- [Když build spadne](#když-build-spadne)
- [Automatická aktualizace a 60 dní bez aktivity](#automatická-aktualizace-a-60-dní-bez-aktivity)
- [Spuštění na vlastním počítači](#spuštění-na-vlastním-počítači)
- [Po aktualizaci Scalaru](#po-aktualizaci-scalaru)

## Jak web vzniká

Web ukazuje technickou referenci API a k ní texty pro lidi. Technická část (operace, parametry, tvar odpovědí) pochází ze specifikace, kterou vydává backend. Texty žijí v tomto repu jako soubory Markdownu ve složce `content/` a při sestavení webu (buildu) se vkládají do specifikace.

| Co | Kde |
| --- | --- |
| Kapitoly úvodu (úvod, autentizace, průvodce, XML, chyby, FAQ) | `content/cs/intro/` |
| Úvodní text skupiny v menu | `content/cs/tags/` |
| Popis operace | `content/cs/operations/` |
| Anglické znění, stejné názvy souborů | `content/en/…` |
| Šablona popisu operace | `content/cs/_sablona-operace.md`, `content/en/_sablona-operace.md` |
| Příklady požadavků a odpovědí, opravy specifikace | `overlay/` (spravuje programátor) |
| Anglický překlad řetězců ze specifikace | `i18n/en.json` |

Po každém uložení změny do větve `main` se web sám sestaví a nasadí. Trvá to zhruba minutu. Stejný postup (workflow „Publikace webu“) běží i jednou denně. Pokaždé nejdřív stáhne ze serveru API aktuální specifikaci; když se změnila, uloží ji do repa a web sestaví už s ní.

Web má dvě prostředí, PROD a TEST, a návštěvník mezi nimi přepíná v záhlaví menu. Texty jsou pro obě prostředí společné.

## Přidání popisu operace krok za krokem

Potřebujete účet na GitHubu s právem zápisu do repa `edsystemcz/dropshippingApiDocs`. Bez něj GitHub místo uložení nabídne „Propose changes“ a změna čeká na schválení někým s právem zápisu.

1. **Zjistěte metodu a cestu operace.** Na webu je u každé operace v záhlaví ukázky kódu (na počítači vpravo od popisu), například `GET /codelists/paymentTypes`. Seznam všech operací, které popis ještě nemají, je ve [výpisu pokrytí](#výpis-pokrytí-a-varování).
2. **Odvoďte název souboru** podle oddílu [Jak pojmenovat soubor](#jak-pojmenovat-soubor). Pro `GET /codelists/paymentTypes` je to `get__codelists_paymentTypes.md`.
3. **Zkopírujte osnovu ze šablony.** Otevřete na GitHubu soubor [`content/cs/_sablona-operace.md`](content/cs/_sablona-operace.md), přepněte zobrazení z „Preview“ na „Code“ a zkopírujte všechno pod vodorovnou čarou `---` (od věty „Jedna až dvě věty pro neprogramátora…“ až do konce).
4. **Vytvořte soubor.** Na GitHubu otevřete složku [`content/cs/operations/`](content/cs/operations/). Nad seznamem souborů klikněte na **Add file** → **Create new file**. Do pole s názvem napište název souboru ze 2. kroku (bez lomítek, jinak GitHub založí novou složku) a do editoru vložte zkopírovanou osnovu.
5. **Napište text.** V každém oddílu nahraďte nápovědu vlastním textem podle [šablony](#šablona-popisu-operace). Záložka **Preview** nad editorem ukáže, jak bude text vypadat.
6. **Uložte.** Klikněte na **Commit changes…**. Do pole „Commit message“ napište, co jste udělali, například `docs: přidání popisu číselníku typů plateb` (předpona `docs:`, pak česky malým písmenem podstatné jméno jako přidání, úprava, oprava). Nechte zvolené **Commit directly to the `main` branch** a potvrďte tlačítkem **Commit changes**.
7. **Počkejte na sestavení.** V záložce **Actions** se objeví běh „Publikace webu“ s vaší zprávou. Žlutá tečka znamená, že běží, zelená fajfka, že je web nasazený (zhruba za minutu). Červený křížek znamená, že build spadl, viz [Když build spadne](#když-build-spadne). Web pak zůstává ve stavu před vaší změnou.
8. **Podívejte se na výsledek.** Otevřete [web](https://edsystemcz.github.io/dropshippingApiDocs/) a v menu najděte operaci v její skupině. Popis je pod názvem operace, nad parametry, v obou prostředích, kde operace existuje. Prohlížeč může ještě až 10 minut ukazovat uloženou starší verzi; pomůže obnovení stránky (Ctrl+F5, na Macu Cmd+Shift+R).

Nic dalšího není potřeba: build soubor najde podle názvu a sám ho vloží k operaci. Anglický protějšek můžete přidat hned, nebo později (viz [Anglická verze](#anglická-verze)).

## Jak pojmenovat soubor

Název souboru se skládá z metody a cesty operace:

1. metoda malými písmeny: `get`, `post`, `put`, `delete`,
2. dvě podtržítka `__`,
3. cesta bez úvodního lomítka, každé další lomítko nahrazené jedním podtržítkem; velikost písmen a složené závorky zůstávají přesně jako na webu,
4. přípona `.md`.

| Operace | Soubor |
| --- | --- |
| `GET /codelists/paymentTypes` | `get__codelists_paymentTypes.md` |
| `GET /codelists/ProductCategory` | `get__codelists_ProductCategory.md` |
| `GET /Info` | `get__Info.md` |
| `POST /b2c/orders` | `post__b2c_orders.md` |
| `PUT /b2b/orders/{orderId}/cancel` | `put__b2b_orders_{orderId}_cancel.md` |

Velikost písmen rozhoduje: `get__codelists_productcategory.md` k operaci `GET /codelists/ProductCategory` nepatří a build skončí chybou (a poradí správný název). Text skupiny se jmenuje podle technického názvu skupiny, ne podle názvu v menu: skupina „Katalog produktů“ má text v `content/cs/tags/Products.md`.

## Šablona popisu operace

Každý popis má stejnou osnovu ([šablona](content/cs/_sablona-operace.md), hotový vzor třeba [`get__codelists_countries.md`](content/cs/operations/get__codelists_countries.md)):

- **úvodní věta** (bez nadpisu): jedna až dvě věty pro neprogramátora, k čemu operace slouží,
- **Kdy ji volat**: v jaké situaci a v jakém kroku integrace, co musí být hotové předtím,
- **Na co si dát pozor**: pravidla a omezení, která z parametrů nejsou vidět,
- **Příklad**: ukázka volání přes `curl`,
- **Časté chyby**: tabulka se stavovým kódem, kdy nastane a co s tím.

Pořadí oddílů neměňte. Oddíl, ke kterému není co říct, smažte i s nadpisem. Parametry ani tvar odpovědi neopisujte, web je pod popisem ukazuje sám ze specifikace. Příklady odpovědí a těla požadavků, které web ukazuje vpravo, nejsou v textu, ale v `overlay/`; o jejich doplnění požádejte programátora.

Soubor nesmí být prázdný. Bloky kódu ohraďte třemi zpětnými apostrofy (`` ``` ``), odsazení čtyřmi mezerami se jako kód nevykreslí.

## Zástupné symboly prostředí

Hodnoty, které se mezi PROD a TEST liší, pište jako zástupné symboly. Build je pro každé prostředí nahradí správnou hodnotou, i uvnitř ukázek kódu.

| Symbol | Co build doplní |
| --- | --- |
| `{{baseUrl}}` | adresa API |
| `{{tokenUrl}}` | adresa pro získání tokenu |
| `{{envSlug}}` | zkratka prostředí: `prod` nebo `test` |

Hodnoty pro každé prostředí jsou v souboru [`environments.json`](environments.json). Cokoli jiného ve dvojitých složených závorkách (i `{{ baseUrl }}` s mezerami nebo překlep `{{baseURL}}`) build zastaví. Proměnné Postmanu proto pište jen názvem, bez závorek. Jednoduché složené závorky jsou v pořádku, například `{orderId}` v cestě nebo `{access_token}` v ukázce.

## Odkazy mezi texty

Na jiný text odkazujte jeho souborem, s cestou od souboru, ve kterém právě píšete. Build odkaz převede na adresu na webu; v náhledu na GitHubu odkaz funguje také.

| Kam | Zápis v souboru ve složce `operations/` |
| --- | --- |
| jiná operace | `[POST /products/catalog](post__products_catalog.md)` |
| kapitola úvodu | `[autentizace](../intro/20-autentizace.md)` |
| nadpis v kapitole úvodu | `[Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách)` |
| skupina | `[Číselníky](../tags/Codelist.md)` |

- Nadpis za `#` se píše malými písmeny, mezery nahrazují pomlčky a diakritika zůstává. Na GitHubu ho zjistíte tak, že v zobrazeném souboru najedete myší na nadpis a zkopírujete odkaz u něj. Do textu z něj patří jen část od `#`; celá adresa `https://github.com/…` by na webu vedla na GitHub.
- Na operaci nebo skupinu, která popis ještě nemá, se odkazuje stejně: souborem, ve kterém její popis jednou bude (`[založení objednávky](post__b2c_orders.md)`). Na webu odkaz funguje hned, v náhledu na GitHubu až po vzniku souboru. Odkaz na nadpis v takovém souboru (`…md#nadpis`) je chyba.
- Odkaz na nadpis v popisu operace nebo v textu skupiny vede na celou operaci nebo skupinu; přesněji web necílí. Nadpis ale v souboru existovat musí.
- Když odkazovaná operace existuje jen v jednom prostředí (nová operace bývá nejdřív jen v TEST), zůstane v druhém prostředí z odkazu jen text.
- Odkaz pište vždy v hranatých a kulatých závorkách. Zápis definicí pod čarou (`[značka]: soubor.md`) build odmítne.

Odkaz, který vede na neexistující soubor nebo nadpis, build zastaví (viz [Když build spadne](#když-build-spadne)).

## Úprava existujícího textu

Otevřete soubor na GitHubu, klikněte na ikonu tužky (**Edit this file**), upravte text a uložte stejně jako v 6. kroku výše. Totéž platí pro kapitoly úvodu a texty skupin.

Pro kapitoly úvodu (`content/<jazyk>/intro/`) platí navíc:

- Pořadí kapitol určuje číslo na začátku názvu souboru (`10-uvod.md`, `20-autentizace.md`, …).
- Každá kapitola začíná nadpisem první úrovně (`# Název kapitoly`). Nadpisy se stanou položkami menu.
- Nadpisy pište křížky (`##`) a jako prostý text: bez zpětných apostrofů, hvězdiček, odkazů a dvojic podtržítek. Nadpis s formátováním by v menu nikam nevedl a build ho odmítne.
- Změníte-li nadpis, na který jiné texty odkazují, upravte i odkazy, jinak build spadne.

Soubor může ležet jen ve složkách `intro/`, `tags/` a `operations/` a musí mít příponu `.md`. Soubory začínající podtržítkem (šablona) build přeskakuje.

## Anglická verze

Anglický text má stejný název souboru ve složce `content/en/` (popis `content/cs/operations/get__codelists_paymentTypes.md` má protějšek `content/en/operations/get__codelists_paymentTypes.md`). Anglická šablona je [`content/en/_sablona-operace.md`](content/en/_sablona-operace.md), pojmy v angličtině jsou ve [slovníku](GLOSSARY.md).

Protějšek může přijít později. Do té doby:

- anglický web ukazuje operaci bez dlouhého popisu: s anglickým názvem, parametry a odpověďmi, ale bez textu; česky se tam nic nedoplní,
- build vypíše varování „Texty bez protějšku v druhém jazyce“ s cestou souboru, který chybí.

Totéž platí obráceně pro anglický text bez českého protějšku.

Řetězce ze specifikace (názvy operací, popisy parametrů, vlastností a odpovědí) jsou ve zdroji jen česky. Anglický web je překládá podle slovníku [`i18n/en.json`](i18n/en.json), kde klíčem je český řetězec a hodnotou anglický překlad. Když backend přidá nebo změní popis (například po opravě nejasných popisů ve specifikaci), build nový řetězec vypíše jako varování „nepřeložené řetězce ze specifikace“, s místem ve specifikaci v závorce:

```text
en: nepřeložené řetězce ze specifikace (1), zůstaly česky; doplňte je do i18n/en.json:
  "Číselník typů plateb."  (paths › /codelists/paymentTypes › get › summary)
```

Řetězec v uvozovkách zkopírujte do slovníku (bez závorky s místem), za něj dejte dvojtečku a překlad v uvozovkách a mezi záznamy čárku:

```json
"Číselník typů plateb.": "Payment type codelist.",
```

Do té doby zůstane na anglickém webu česky. Prázdný překlad nebo porušený zápis souboru (chybějící čárka či uvozovka) build zastaví. Překlad, který už ve specifikaci nic nepřekládá, build jen oznámí; můžete ho smazat.

## Výpis pokrytí a varování

Build na konci vypíše pro každý jazyk a prostředí, kolik operací a skupin má text, a seznam operací bez popisu seřazený podle skupin. To je seznam zbývající práce:

```text
cs PROD: popsáno 5 z 28 operací a 5 z 5 skupin
cs PROD: operace bez textu:
  Info
    GET /Info
  Codelist
    GET /codelists/paymentTypes
    …
```

Kde výpis najdete:

- **Na GitHubu:** záložka **Actions** → běh „Publikace webu“ → vlevo úloha „Specifikace a build“ → rozbalit krok **Build**.
- **Na vlastním počítači:** `npm run build` (viz [Spuštění na vlastním počítači](#spuštění-na-vlastním-počítači)).

Ve stejném výpisu jsou i varování. Nic z nich web nezastaví:

| Varování | Co s tím |
| --- | --- |
| skupiny bez textu, operace bez textu | seznam zbývající práce |
| Texty bez protějšku v druhém jazyce | doplnit překlad textu, viz [Anglická verze](#anglická-verze) |
| nepřeložené řetězce ze specifikace | doplnit do `i18n/en.json` |
| odkaz vede na skupinu nebo operaci, která v prostředí není | jen informace, operace je zatím jen v jednom prostředí |

## Když build spadne

Spadlý build poznáte podle červeného křížku u běhu v záložce **Actions**; GitHub vám může poslat i e-mail, pokud ho máte v nastavení upozornění zapnutý. Web se nerozbije: zůstává na něm poslední verze, která prošla, dokud chybu neopravíte. Důvod je v přehledu běhu jako chyba **Build se zastavil**, podrobně v kroku **Build**. Hlášení o chybě v textu jmenuje soubor, kterého se týká. Build se někdy zastaví na první chybě, takže po její opravě může přijít další hlášení.

### Osiřelý text

```text
Osiřelé texty: skupina nebo operace není v žádném prostředí (přejmenovala se nebo zmizela):
  content/cs/operations/get__codelists_productcategory.md (liší se jen velikostí písmen od get__codelists_ProductCategory.md)
```

Soubor neodpovídá žádné operaci ani skupině v PROD ani v TEST. Možné příčiny:

- **Překlep v názvu souboru**, typicky velikost písmen nebo jedno podtržítko místo dvou. Soubor přejmenujte: otevřete ho, klikněte na tužku, opravte název v poli nad editorem a uložte.
- **Operace se v API přejmenovala nebo zmizela.** Build obvykle spadne hned po automatické aktualizaci specifikace. V historii commitů (**Commits**) najdete commit od `github-actions[bot]` se zprávou `chore(spec): aktualizace specifikace …`; v jeho popisu je seznam přidaných, odebraných a změněných operací. Přejmenovanou operaci obslouží přejmenování českého i anglického souboru podle nové cesty. Text zrušené operace smažte (u souboru menu **…** → **Delete file**), v obou jazycích.

Po smazání nebo přejmenování může build spadnout na odkazech, které na soubor vedly z jiných textů; opravte je podle další části.

### Nefunkční odkaz

```text
Chyby v textech:
  content/cs/operations/get__codelists_paymentTypes.md: odkaz ../intro/30-synchronizace-katalogu.md#neexistuje vede na nadpis, který v content/cs/intro/30-synchronizace-katalogu.md není; nadpisy v souboru: #průvodce-synchronizací-katalogu, #průběh-jobu, …
```

Otevřete soubor z hlášení a opravte v něm uvedený odkaz. U nadpisu hlášení vypíše nadpisy, které v cílovém souboru jsou; vyberte správný. Odkaz na soubor, který neexistuje a neodpovídá žádné operaci ani skupině, je překlep v názvu souboru nebo vede na zrušenou operaci.

### Další chyby v textech

| Hlášení | Oprava |
| --- | --- |
| `soubor je prázdný` | doplňte text, nebo soubor smažte |
| `obsahuje neznámý zástupný symbol` | opravte symbol podle [tabulky](#zástupné-symboly-prostředí) |
| `kapitola úvodu musí začínat nadpisem první úrovně` | na první řádek kapitoly dejte `# Název` |
| nadpis s formátováním nebo zapsaný podtržením | nadpis pište křížky a jako prostý text |
| `je zapsaný definicí pod čarou` | odkaz přepište na `[text](soubor.md)` |
| `Soubory nejsou text úvodu, skupiny ani operace` | soubor přesuňte do `intro/`, `tags/` nebo `operations/` a dejte mu příponu `.md` |

Když hlášení míří mimo `content/` a `i18n/` (například validace OpenAPI nebo neveřejný údaj ve specifikaci), předejte ho programátorovi.

## Automatická aktualizace a 60 dní bez aktivity

Workflow „Publikace webu“ (`.github/workflows/publish.yml`) se spouští třemi způsoby: po každém uložení změny do `main`, jednou denně (kolem 4:17 UTC, GitHub plánované běhy občas zpozdí) a ručně tlačítkem **Run workflow** v záložce **Actions**.

GitHub ve veřejném repu plánované workflow automaticky vypne, když v repu 60 dní neproběhla žádná aktivita ([dokumentace GitHubu](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows), ověřeno v listopadu 2026). Předem neupozorňuje. Web dál funguje, jen se přestane sám aktualizovat podle nových verzí API.

Znovu zapnutí:

1. Otevřete záložku **Actions**.
2. V levém sloupci klikněte na workflow **Publikace webu**.
3. Klikněte na **Enable workflow**.
4. Pro okamžitou aktualizaci klikněte na **Run workflow** → **Run workflow**.

Když po delší pauze uložíte text a v záložce **Actions** nepřibude nový běh, je workflow nejspíš vypnutý; zapněte ho stejným postupem.

## Spuštění na vlastním počítači

Hodí se pro kontrolu většího množství změn před uložením na GitHub. Potřebujete [Git](https://git-scm.com/), [Node.js](https://nodejs.org/) 22 nebo novější a pro zobrazení webu Python 3.

```bash
git clone https://github.com/edsystemcz/dropshippingApiDocs.git
cd dropshippingApiDocs
npm ci                 # jednou, nainstaluje závislosti
npm run build          # sestaví web do složky dist/ a vypíše pokrytí a varování
python3 -m http.server 8000 --directory dist
```

Na Windows se poslední příkaz píše `py -m http.server 8000 --directory dist`. Web pak běží na <http://localhost:8000/> (anglicky <http://localhost:8000/en/>); server zastavíte klávesami Ctrl+C. Soubor `dist/index.html` otevřený přímo z disku nefunguje, prohlížeč z něj specifikaci nenačte. Po každé změně textu spusťte znovu `npm run build` a obnovte stránku.

Další příkazy:

| Příkaz | Co dělá |
| --- | --- |
| `npm test` | spustí testy |
| `npm run verify` | ověří sestavený web v Chrome: menu, odkazy mezi texty, přepínače, žádné cizí domény |

## Po aktualizaci Scalaru

Tato část je pro programátora. Web vykresluje [Scalar](https://github.com/scalar/scalar), zafixovaný v `package.json`. České rozhraní Scalaru (tlačítka, vyhledávání) pochází z překladů v repu:

- [`i18n/scalar.cs.json`](i18n/scalar.cs.json): překlad textů, které Scalar překládat umí,
- [`i18n/scalar-fixed.cs.json`](i18n/scalar-fixed.cs.json): texty, které má Scalar napevno anglicky a stránka je přepisuje skriptem.

Po změně verze Scalaru spusťte `npm test`, který vypíše nové nebo zastaralé řetězce rozhraní (nové zůstanou do doplnění anglicky), a `npm run verify`, který kontroluje úpravy rozhraní, jež stránka dělá zvenku ([ADR 0005](docs/adr/0005-upravy-rozhrani-scalaru-zvenku.md)). Důvody dalších rozhodnutí jsou v [`docs/adr/`](docs/adr/).

# Dokumentace Dropshipping API

Veřejný dokumentační web pro Dropshipping API společnosti eD system: popisuje zákazníkům, jak přes API synchronizovat katalog produktů, sklady a ceny a jak pracovat s objednávkami. Slovník drží jednotné názvosloví pro české i anglické texty; anglický ekvivalent je u každého pojmu v závorce.

## Pojmy

### Katalog

**Full katalog** (Full catalog):
Kompletní katalog produktů vygenerovaný podle jednoho katalogového profilu.
_Nepoužívat_: datová základna, plný katalog

**Update katalog** (Update catalog):
Katalog obsahující jen produkty, které se změnily proti rozdílovému základu. Není to rozdíl proti předchozímu Update katalogu.
_Nepoužívat_: rozdílový katalog, inkrement

**Katalogový profil** (catalog profile):
Kombinace hodnot a přítomnosti volitelných parametrů `currencyId`, `countryIdFee` a `onStock`, kterou zákazník drží neměnnou pro Full katalog i všechny navazující Update katalogy. Vynechaný parametr a tentýž parametr s výchozí hodnotou jsou dva různé profily.
_Nepoužívat_: synchronizační profil, konfigurace požadavku

**Rozdílový základ** (differential baseline):
Nejnovější Full katalog daného katalogového profilu, proti kterému se počítá Update katalog.
_Nepoužívat_: Full základ

**Job** (job):
Jedno generování katalogu, určené hodnotou `transactionId`.
_Nepoužívat_: katalogový job, dávka, požadavek, transakce

**Katalogový soubor** (catalog file):
ZIP s právě jedním XML souborem, který je výsledkem úspěšného jobu.
_Nepoužívat_: ceník, export

**Vyřazený produkt** (discontinued product):
Produkt, který byl v předchozím Full katalogu a v aktuálním Full katalogu téhož profilu chybí.
_Nepoužívat_: zrušený produkt

### Ceny a poplatky

**Země poplatků** (fee country):
Země, podle které se počítají poplatky a sazba DPH; nezávisí na měně.

**Autorský poplatek** (copyright fee):
Poplatek uvedený v XML jako `AOFee`.

**Recyklační poplatek** (recycling fee):
Poplatek uvedený v XML jako `SNCFee`.
_Nepoužívat_: poplatek za elektroodpad

### Přístup

**Zákazník** (customer):
Firma s dealerskou smlouvou s eD system, která se na API napojuje. Její systém, do kterého data importuje, je „e-shop“.
_Nepoužívat_: partner, klient, dealer

**eD SHOP** (eD SHOP):
Webový obchod eD system pro zákazníky, ve kterém si zákazník zakládá API účet. Není to „e-shop“, tím se rozumí systém zákazníka.
_Nepoužívat_: eDshop, e-shop eD system

**API účet** (API account):
Kontaktní osoba zákazníka označená v eD SHOPu jako účet pro datovou výměnu. Slouží jen k přihlášení k API a do eD SHOPu přístup nemá.

**Autentizace** (authentication):
Získání tokenu a jeho použití při volání API.
_Nepoužívat_: autentifikace

### Dokumentační web

**Operace** (operation):
Kombinace HTTP metody a cesty; jednotka, ke které se píše popis a podle které se počítá pokrytí. Ve veřejných textech smí zůstat slovo „endpoint“.
_Nepoužívat_: endpoint (v repu)

**Skupina** (group):
Pojmenovaná skupina operací v menu webu.
_Nepoužívat_: tag, sekce

**Osiřelý text**:
Soubor s textem, ke kterému v žádném prostředí neexistuje operace ani skupina.

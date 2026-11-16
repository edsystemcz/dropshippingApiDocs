# Autentizace

API používá OAuth 2.0. Access token se posílá v hlavičce každého volání Dropshipping API:

```http
Authorization: Bearer {access_token}
```

## Získání přístupu

K získání tokenu potřebujete dvě dvojice přihlašovacích údajů: `client_id` a `client_secret` od eD system a `username` a `password` API účtu.

### Client ID a Client Secret

Požádejte svého obchodního manažera nebo zákaznickou péči o kontakt na IT, které s vámi přidělení dořeší. Kontakt najdete v oddílu [Podpora](50-chyby.md#podpora).

### API účet

`username` a `password` patří API účtu, který si vytvoříte sami v eD SHOPu. Podmínkou je uzavřená dealerská smlouva s eD system a. s.

1. Přihlaste se administrátorským účtem do eD SHOPu: [edshopb2b.edsystem.cz](https://edshopb2b.edsystem.cz) (česká lokalizace) nebo [edshop.edsystem.sk](https://edshop.edsystem.sk) (slovenská lokalizace).
2. V sekci „Moje nastavení“ je přehled kontaktních osob. Vytvořte novou kontaktní osobu, která bude sloužit jako účet pro datovou výměnu.
3. Označte ji jako „API účet“ a uložte.
4. Tlačítkem „Změnit heslo“ nastavte novému účtu heslo.

Celé nastavení proveďte v eD SHOPu, ne přes odkaz z e-mailu. Formulář pro zapomenuté heslo u API účtu žádný e-mail nepošle: API účet je zvláštní typ účtu, který do eD SHOPu přístup nemá.

## Získání tokenu

Token vydává token endpoint `{{tokenUrl}}`. Při prvním získání tokenu pošlete grant type `password` a všechny čtyři přihlašovací údaje. Scopes nejsou vyžadované.

```bash
curl -X POST '{{tokenUrl}}' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id={clientId}' \
  --data-urlencode 'client_secret={clientSecret}' \
  --data-urlencode 'username={username}' \
  --data-urlencode 'password={password}'
```

Access token platí přibližně 10 minut.

## Obnova tokenu

Token obnovíte na stejné adrese s grant type `refresh_token`:

```bash
curl -X POST '{{tokenUrl}}' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode 'client_id={clientId}' \
  --data-urlencode 'client_secret={clientSecret}' \
  --data-urlencode 'refresh_token={refreshToken}'
```

Access token můžete lokálně cachovat a obnovovat pomocí refresh tokenu, nebo si před založením každého jobu vyžádat nový. API tento postup nijak neomezuje.

## Kolekce pro Postman

API si můžete vyzkoušet z [Postmanu](https://www.postman.com/) nebo jiného nástroje, který čte kolekce ve formátu Postman Collection v2.1. Kolekce obsahuje všechny operace zvoleného prostředí a na začátku složku Autentizace s požadavky na získání a obnovu tokenu. Kolekce je pro prostředí, ve kterém si ji na webu stáhnete; pro druhé prostředí si stáhněte jeho kolekci.

[Stáhnout kolekci pro Postman](postman.{{envSlug}}.json)

1. V Postmanu zvolte Import a vyberte stažený soubor.
2. V proměnných kolekce (záložka Variables) vyplňte clientId, clientSecret, username a password, tedy údaje z oddílu [Získání přístupu](#získání-přístupu). Proměnné baseUrl a tokenUrl už mají adresy zvoleného prostředí.
3. Ve složce Autentizace spusťte požadavek Získání tokenu. Uloží access token a refresh token do proměnných accessToken a refreshToken a ostatní požadavky kolekce access token použijí samy. Když vyprší, spusťte Obnova tokenu.

Založení jobu uloží `transactionId`, které použije zjištění stavu jobu, a zjištění stavu po vygenerování souboru uloží `fileName` pro stažení katalogového souboru. Synchronizaci katalogu tak projdete požadavek po požadavku bez kopírování hodnot.

Přihlašovací údaje vyplňujte jen u sebe a kolekci s vyplněnými proměnnými nesdílejte.

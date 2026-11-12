# Úvod

Přes Dropshipping API si vyžádáte vygenerování katalogového souboru s produkty, sklady a cenami. Generování probíhá asynchronně: API nejprve vrátí `transactionId`, podle kterého zjišťujete stav jobu. Po dokončení jobu vrátí `fileName`, podle kterého katalogový soubor stáhnete.

Adresa API je `{{baseUrl}}`.

## Přehled operací

| Účel                                   | Operace                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Získání číselníku měn pro `currencyId` | [`GET /codelists/currencies`](../operations/get__codelists_currencies.md) |

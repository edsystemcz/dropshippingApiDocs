Vrátí stav jobu podle `transactionId`. Podle stavu poznáte, jestli je katalogový soubor hotový a pod jakým názvem ho stáhnete.

## Kdy ji volat

Po založení jobu operací [`POST /products/catalog`](post__products_catalog.md), opakovaně, dokud job neskončí. Jak často se ptát, popisuje průvodce v oddílu [Plánování](../intro/30-synchronizace-katalogu.md#plánování) a jak dlouho job trvá, v oddílu [Jak dlouho job trvá](../intro/30-synchronizace-katalogu.md#jak-dlouho-job-trvá).

## Na co si dát pozor

`transactionId` slouží k dotazům na stav konkrétního jobu a je dostupné omezenou dobu: počítejte s 24 hodinami od vygenerování. Založení nového jobu předchozí `transactionId` nesmaže.

Stav jobu (`state`) může mít tyto hodnoty:

| Stav         | Význam                              |
| ------------ | ----------------------------------- |
| `Undefined`  | Job je založený a čeká na spuštění. |
| `Accepted`   | Job je přijatý ke zpracování.       |
| `InProcess`  | Job se zpracovává.                  |
| `Inserted`   | Interní průběžný stav.              |
| `Updated`    | Interní průběžný stav.              |
| `Deleted`    | Interní stav.                       |
| `Rejected`   | Job byl odmítnut.                   |
| `Cancelled`  | Job byl zrušen.                     |
| `Error`      | Job skončil chybou.                 |
| `Generated`  | Katalogový soubor je vygenerovaný.  |
| `Successful` | Obecný úspěšný stav.                |

Jak podle stavu poznat, že job skončil, a co potom dělat, popisuje průvodce v oddílu [Konec jobu](../intro/30-synchronizace-katalogu.md#konec-jobu).

## Příklad

```bash
curl -X GET '{{baseUrl}}/products/catalog?transactionId=3fa85f64-5717-4562-b3fc-2c963f66afa6' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

Příklady odpovědi pro čekající job, zpracovávaný job a vygenerovaný soubor si vyberete u odpovědi `200`.

## Časté chyby

| Stavový kód | Kdy nastane                                                          | Co s tím                                                                                                      |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `400`       | Chybný požadavek, například chybějící nebo neplatné `transactionId`. | Pošlete `transactionId` z odpovědi operace `POST /products/catalog`.                                          |
| `401`       | Token chybí, je neplatný nebo vypršel.                               | [Obnovte token](../intro/20-autentizace.md#obnova-tokenu) nebo získejte nový a volání zopakujte.              |
| `404`       | Job nebyl nalezen.                                                   | Zkontrolujte `transactionId`. Když už není dostupné, založte nový job.                                        |
| `500`       | Interní chyba serveru.                                               | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |
| `503`       | Služba je dočasně nedostupná.                                        | Postupujte podle oddílu [Opakování při chybách](../intro/30-synchronizace-katalogu.md#opakování-při-chybách). |

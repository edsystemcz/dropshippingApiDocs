# Chyby

API může vracet standardní chybové tělo JSON ve formátu `ProblemDetails`. Typická struktura:

```json
{
  "type": "string",
  "title": "string",
  "status": 400,
  "detail": "string",
  "instance": "string"
}
```

| Pole       | Význam                                                    |
| ---------- | --------------------------------------------------------- |
| `type`     | Typ chyby nebo odkaz na typ chyby.                        |
| `title`    | Krátký název chyby.                                       |
| `status`   | HTTP status kód.                                          |
| `detail`   | Podrobnější popis chyby.                                  |
| `instance` | Identifikace konkrétní instance chyby, pokud je vyplněná. |

Celé chybové tělo doporučujeme ukládat do technických logů.

## Podpora

S problémem se obraťte na svého obchodního manažera nebo na zákaznickou péči: [customercare@edsystem.cz](mailto:customercare@edsystem.cz)

K hlášení přiložte:

- datum a čas problému,
- použitý endpoint,
- HTTP status kód,
- `transactionId`,
- `fileName`, pokud byl vrácen,
- `state`, `stateChanged`, `errorCode` a `errorMessage`, pokud byly vráceny,
- ukázku request a response body bez citlivých údajů.

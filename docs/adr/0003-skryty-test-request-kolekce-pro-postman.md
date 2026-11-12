# Tlačítko „Test Request“ je skryté, nahrazuje ho kolekce pro Postman

„Test Request“ volá API přímo z prohlížeče. API neposílá hlavičky CORS, takže by volání fungovalo jen přes proxy Scalaru, kterou jsme odmítli (ADR 0002), a backend neměníme (ADR 0001). Tlačítko je proto skryté a web místo něj nabízí ke stažení kolekci pro Postman; klient na počítači zákazníka omezení CORS nemá.

## Důsledky

- Se skrytým tlačítkem zmizí i panel pro zadání tokenu. Návštěvník na webu žádný token nezadává a na tom stojí znění zásad ochrany osobních údajů.
- Pokud backend někdy začne hlavičky CORS posílat, lze rozhodnutí otevřít znovu; spolu s tlačítkem je pak potřeba upravit i zásady.

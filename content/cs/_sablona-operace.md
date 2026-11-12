# Šablona popisu operace

Jak šablonu použít:

1. Text pod čarou zkopírujte do nového souboru ve složce `operations/`. Soubor pojmenujte podle metody a cesty operace: metoda malými písmeny, dvě podtržítka a cesta s podtržítky místo lomítek, se stejnou velikostí písmen jako ve specifikaci. Například `GET /codelists/ProductCategory` má popis v souboru `get__codelists_ProductCategory.md`.
2. V každém oddílu nahraďte nápovědu vlastním textem. Pořadí oddílů neměňte; oddíl, ke kterému není co říct, smažte i s nadpisem.
3. Adresu API pište jako `{{baseUrl}}` a adresu pro získání tokenu jako `{{tokenUrl}}`. Build doplní hodnotu podle prostředí.
4. Na jiný text odkazujte jeho souborem, například `[úvod](../intro/10-uvod.md)`. Build odkaz převede na adresu na webu.

Parametry a tvar odpovědi neopisujte. Web je pod popisem ukazuje přímo ze specifikace.

---

Jedna až dvě věty pro neprogramátora: k čemu operace slouží.

## Kdy ji volat

V jaké situaci a v jakém kroku integrace se operace volá a co musí být hotové předtím.

## Na co si dát pozor

Pravidla a omezení, která z parametrů nejsou vidět. Pro souvislosti odkažte do úvodních kapitol.

## Příklad

```bash
curl -X GET '{{baseUrl}}/cesta/operace' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

## Časté chyby

| Stavový kód | Kdy nastane | Co s tím |
| ----------- | ----------- | -------- |
| `400`       |             |          |

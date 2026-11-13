# Rozhraní Scalaru upravujeme zvenku, jeho kód neměníme

Některé úpravy rozhraní Scalar ve vlastním sestavení nenabízí: vlastní obsah v jeho menu (přepínače režimu a jazyka na mobilu), překlad textů, které má napevno anglicky (tlačítko kopírování „Copy“), nebo animace prvků, které vkládá do stránky. Scalar proto neforkujeme ani neupravujeme jeho přibalený soubor. Úpravy dělá skript naší stránky (`site/index.html`), který hotovou stránku po Scalaru doplní, a styly v `site/site.css`; Scalar zůstává zafixovaná závislost, kterou jde aktualizovat změnou verze (ADR 0002).

## Důsledky

- Úpravy stojí na vnitřní stavbě stránky, kterou Scalar vykresluje (třídy jako `.darklight-reference`, přesné znění textů). Nová verze Scalaru je může tiše rozbít; po každé aktualizaci je proto potřeba spustit `npm test` a `npm run verify`, které je kontrolují.
- Co Scalar ze stránky hned odstraní (zavřená skupina v menu), se nedá animovat; animuje se jen otevření.
- Přepínač režimu Scalaru zůstává ve stránce skrytý a naše tlačítko ho jen spouští, takže barevný režim dál ukládá jen Scalar a úložiště prohlížeče se nemění (ADR 0006).

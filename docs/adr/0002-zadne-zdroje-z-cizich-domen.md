# Web nenačítá nic z cizích domén

Scalar ani písma se nenačítají z CDN: jsou zafixované jako npm závislosti a build je kopíruje do webu. Vypnuté jsou i funkce Scalaru, které volají jeho servery (proxy pro obcházení CORS, funkce s AI, sdílení). Web má fungovat bez cookies lišty a jeho zásady ochrany osobních údajů tvrdí, že nenačítá obsah od třetích stran; proxy by navíc posílala tokeny zákazníků přes cizí server.

## Důsledky

- Aktualizace Scalaru nebo písem je vědomý krok (změna verze závislosti), ne automatika.
- Kdo přidá měření návštěvnosti, vložený obsah nebo jinou službu třetí strany, musí zároveň upravit zásady ochrany osobních údajů.

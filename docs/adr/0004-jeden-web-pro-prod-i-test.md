# Jeden web pro PROD i TEST se společnými texty

Web zobrazuje produkční i testovací prostředí Dropshipping API a návštěvník mezi nimi přepíná. Obě prostředí sdílejí jednu sadu textů, aby se každý popis udržoval na jednom místě; hodnoty, které se liší (adresy API a token endpointu), se do textů doplňují zástupnými symboly. Web je určený jen pro Dropshipping API, ostatní API firmy mají jiné publikum a vlastní dokumentaci.

## Důsledky

- Nová operace se obvykle objeví nejdřív v TEST. Její text se vloží jen do prostředí, kde operace existuje; osiřelý je až text bez operace v obou prostředích.
- Rozdíl mezi prostředími, který nejde vyjádřit adresou, nemá v textech vlastní místo. Jediné, co se liší, je upozornění na začátku úvodu u TEST.

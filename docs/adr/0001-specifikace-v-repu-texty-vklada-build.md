# Specifikace se kopíruje do repa a texty do ní vkládá build

Specifikace, kterou vystavuje API, nemá slovní popisy operací, postup autentizace ani operaci pro stažení katalogového souboru, a server ji neposílá s hlavičkami CORS, takže ji stránka na jiné doméně nenačte. Backend proto neměníme: workflow specifikaci stahuje do `spec/` a build do ní vkládá texty z `content/` a doplňky z `overlay/`. Texty tak může upravovat i neprogramátor a web načítá specifikaci ze své vlastní domény.

## Důsledky

- Web ukazuje kopii specifikace. Workflow ji stahuje jednou denně, takže se proti běžícímu API může opozdit nejvýše o den.
- Texty se k operacím párují podle metody a cesty. Když backend operaci přejmenuje nebo odstraní, vznikne osiřelý text a build spadne; nasazená zůstane poslední funkční verze webu.

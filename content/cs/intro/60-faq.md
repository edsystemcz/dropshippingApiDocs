# Časté otázky

## Musíme stahovat Full katalog pokaždé?

Ne. Jak často zakládat Full a Update katalogy, popisuje průvodce v oddílu [Plánování](30-synchronizace-katalogu.md#plánování).

## Je Update katalog rozdíl proti poslednímu Update katalogu?

Ne. Proti čemu se Update katalog počítá, popisuje průvodce v oddílu [Full a Update katalog](30-synchronizace-katalogu.md#full-a-update-katalog).

## Můžeme přijít o nějaký Update katalog?

Ne. Proč ne, vysvětluje průvodce v oddílu [Full a Update katalog](30-synchronizace-katalogu.md#full-a-update-katalog).

## Urychlí častější dotazování generování souboru?

Ne. Proč ne, vysvětluje průvodce v oddílu [Jak dlouho job trvá](30-synchronizace-katalogu.md#jak-dlouho-job-trvá).

## Můžeme stáhnout stejný soubor opakovaně?

Ano, dokud je katalogový soubor dostupný. Jak dlouho to je, uvádí popis operace [stažení katalogového souboru](../operations/get__files_{fileName}.md).

## Máme při nové aktualizaci znovu stahovat stejný fileName?

Ne. Odkud se berou novější data, uvádí popis operace [stažení katalogového souboru](../operations/get__files_{fileName}.md).

## Jak poznáme vyřazené produkty?

Porovnáním dvou Full katalogů. Postup popisuje kapitola XML struktura v oddílu [Vyřazené produkty](40-xml-struktura.md#vyřazené-produkty).

## Máme pro běžnou synchronizaci používat onStock?

Ne. Proč ne, vysvětluje průvodce v oddílu [Katalogový profil](30-synchronizace-katalogu.md#katalogový-profil).

## Jak nastavíme jinou měnu nebo zemi poplatků?

Volitelnými parametry v těle požadavku na založení jobu. Které to jsou a jak je zvolit, popisuje průvodce v oddílu [Měna a země poplatků](30-synchronizace-katalogu.md#měna-a-země-poplatků).

## Jaké nastavení má použít slovenský zákazník s cenami v EUR?

Doporučené kombinace měny a země poplatků, včetně slovenské, uvádí průvodce v oddílu [Měna a země poplatků](30-synchronizace-katalogu.md#měna-a-země-poplatků).

## Jaké je výchozí nastavení bez currencyId a countryIdFee?

Výchozí nastavení uvádí průvodce v oddílu [Měna a země poplatků](30-synchronizace-katalogu.md#měna-a-země-poplatků). Proč ho nekombinovat s explicitními výchozími hodnotami, vysvětluje oddíl [Katalogový profil](30-synchronizace-katalogu.md#katalogový-profil).

## Můžeme v Update katalogu použít jiné parametry než v předchozím Full katalogu?

Nedoporučujeme. Proč, vysvětluje průvodce v oddílu [Katalogový profil](30-synchronizace-katalogu.md#katalogový-profil).

## Udržuje API samostatný rozdílový základ pro každý katalogový profil?

Ano. Co z toho plyne, popisuje průvodce v oddílu [Katalogový profil](30-synchronizace-katalogu.md#katalogový-profil).

## Je k dispozici kontrolní součet souboru?

Ne. Jak ověřit, že je soubor v pořádku, popisuje průvodce v oddílu [Kontrola staženého souboru](30-synchronizace-katalogu.md#kontrola-staženého-souboru).

## Existuje rate limit?

Ne, samostatný ne. Doporučené intervaly uvádí průvodce v oddílu [Plánování](30-synchronizace-katalogu.md#plánování).

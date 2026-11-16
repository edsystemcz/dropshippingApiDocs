# Připojení na GitHub

Remote `origin` používá SSH. Klíč je chráněný heslem a agent ho odemknout nemůže: heslo zadává uživatel ve vlastním terminálu.

## Když se nejde připojit

Platí pro `git push`, `git fetch`, `git pull` a `git ls-remote`, které visí bez hlášky, vyprší nebo selžou na přihlášení.

1. Pokus neopakuj. Zamčený klíč se projevuje právě tím, že příkaz visí bez hlášky: GitHub klíč přijme a podpis čeká na odemčení.
2. Ukaž uživateli tento postup pro jeho terminál:

   ```bash
   systemctl --user restart gcr-ssh-agent.service
   ls ~/.ssh/*.pub
   ssh-add ~/.ssh/<nazev-klice>
   ssh -T git@github.com
   ```

   - `systemctl …` restartuje správce klíčů prostředí GNOME, který po chybně zadaném hesle přestane o heslo žádat. Jinde se tento krok vynechá.
   - `ls …` vypíše klíče na počítači. Správný je ten, který má uživatel přidaný na GitHubu (Settings → SSH and GPG keys).
   - `ssh-add …` se zeptá na heslo ke klíči a odemčený klíč předá správci klíčů. Název se píše bez přípony `.pub`.
   - `ssh -T …` jen ověří přihlášení; má odpovědět `Hi <účet>! You've successfully authenticated…`.

3. Až uživatel potvrdí, že poslední příkaz odpověděl úspěchem, spusť původní příkaz znovu. Odemčení vydrží do odhlášení z počítače.

## Síťové příkazy gitu

Pouštěj je s `timeout` (například `timeout 60 git push`), aby zamčený klíč nezablokoval celou session.

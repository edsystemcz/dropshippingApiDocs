import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotation, runUrl, stepOutput } from '../scripts/workflow-commands.mjs';

test('hlášení pro přehled běhu je na jednom řádku, i když má zpráva víc řádků a znak procenta', () => {
  const message = 'Osiřelé texty:\n  content/cs/operations/get__Info.md\r\npokrytí 100 %';
  assert.equal(
    annotation('error', 'Build se zastavil', message),
    '::error title=Build se zastavil::Osiřelé texty:%0A  content/cs/operations/get__Info.md%0D%0Apokrytí 100 %25',
  );
});

test('výstup kroku smí mít víc řádků a je uzavřený oddělovačem', () => {
  assert.equal(stepOutput('commit-message', 'předmět\n\ntělo', 'KONEC'), 'commit-message<<KONEC\npředmět\n\ntělo\nKONEC\n');
});

test('výchozí oddělovač výstupu kroku je pokaždé jiný, takže ho hodnota nemůže ukončit předčasně', () => {
  const delimiterOf = (output) => /^x<<(\S+)\n/.exec(output)[1];
  assert.notEqual(delimiterOf(stepOutput('x', 'a')), delimiterOf(stepOutput('x', 'a')));
});

test('adresa běhu workflow se složí z proměnných GitHub Actions; mimo workflow není', () => {
  const env = { GITHUB_SERVER_URL: 'https://github.example', GITHUB_REPOSITORY: 'org/repo', GITHUB_RUN_ID: '42' };
  assert.equal(runUrl(env), 'https://github.example/org/repo/actions/runs/42');
  assert.equal(runUrl({}), undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotation } from '../scripts/workflow-annotations.mjs';

test('hlášení pro přehled běhu je na jednom řádku, i když má zpráva víc řádků a znak procenta', () => {
  const message = 'Osiřelé texty:\n  content/cs/operations/get__Info.md\r\npokrytí 100 %';
  assert.equal(
    annotation('error', 'Build se zastavil', message),
    '::error title=Build se zastavil::Osiřelé texty:%0A  content/cs/operations/get__Info.md%0D%0Apokrytí 100 %25',
  );
});

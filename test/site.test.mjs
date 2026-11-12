// Sestaví web ze skutečných zdrojů repa (šablona, písma, Scalar) a kontroluje,
// co se dostane do výstupu. Chování v prohlížeči (síť, úložiště) tím ověřené
// není; to se po změně nastavení nebo verze Scalaru ověřuje v prohlížeči.

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, siteInputs } from '../scripts/build.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = 'assets/fonts';
let outDir;

before(async () => {
  outDir = join(await mkdtemp(join(tmpdir(), 'site-')), 'dist');
  await build({ ...(await siteInputs(repoRoot)), outDir, log: { info: () => {}, warn: () => {} } });
});

const read = (path) => readFile(join(outDir, path), 'utf8');

test('výstup obsahuje právě vyjmenované soubory', async () => {
  const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(outDir.length + 1))
    .sort();

  assert.deepEqual(files, [
    'assets/favicon.svg',
    'assets/fonts/LICENSE-inter.txt',
    'assets/fonts/LICENSE-jetbrains-mono.txt',
    'assets/fonts/fonts.css',
    'assets/fonts/inter-latin-ext-wght-italic.woff2',
    'assets/fonts/inter-latin-ext-wght-normal.woff2',
    'assets/fonts/inter-latin-wght-italic.woff2',
    'assets/fonts/inter-latin-wght-normal.woff2',
    'assets/fonts/inter-symbols.woff2',
    'assets/fonts/jetbrains-mono-latin-ext-wght-normal.woff2',
    'assets/fonts/jetbrains-mono-latin-wght-normal.woff2',
    'assets/scalar/standalone.js',
    'en/index.html',
    'en/openapi.prod.json',
    'en/openapi.test.json',
    'index.html',
    'openapi.prod.json',
    'openapi.test.json',
  ]);
});

/** Pravidla @font-face ze stylu písem: rodina, soubor a rozsahy znaků. */
async function fontFaces() {
  const css = await read(`${FONT_DIR}/fonts.css`);
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
    family: /font-family:\s*'([^']+)'/.exec(body)[1],
    file: /url\(([^)]+)\)/.exec(body)[1],
    ranges: /unicode-range:\s*([^;]+);/.exec(body)[1].split(',').map((range) => {
      const [from, to = from] = range.trim().slice(2).split('-');
      return [parseInt(from, 16), parseInt(to, 16)];
    }),
  }));
}

test('písma Inter a JetBrains Mono jsou přibalená jako WOFF2 a styl odkazuje jen na přibalené soubory', async () => {
  const faces = await fontFaces();

  assert.deepEqual([...new Set(faces.map((face) => face.family))].sort(), ['Inter', 'JetBrains Mono']);
  for (const { file } of faces) {
    const bytes = await readFile(join(outDir, FONT_DIR, file));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file} není WOFF2`);
  }
});

test('obě písma pokrývají českou diakritiku', async () => {
  const faces = await fontFaces();

  for (const family of ['Inter', 'JetBrains Mono']) {
    const ranges = faces.filter((face) => face.family === family).flatMap((face) => face.ranges);
    for (const letter of 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ') {
      const code = letter.codePointAt(0);
      assert.ok(ranges.some(([from, to]) => from <= code && code <= to), `${family} nepokrývá „${letter}“`);
    }
  }
});

test('stránky ani styl písem neodkazují na žádnou adresu s doménou', async () => {
  for (const path of ['index.html', 'en/index.html', `${FONT_DIR}/fonts.css`]) {
    const content = await read(path);
    // Odkaz, skript, styl ani písmo nesmí mít adresu se schématem nebo začínat lomítkem.
    const references = [...content.matchAll(/(?:href|src)="([^"]*)"|url\(([^)]*)\)/g)].map((match) => match[1] ?? match[2]);
    assert.ok(references.length > 0, `${path}: žádné odkazy ke kontrole`);
    for (const reference of references) {
      assert.doesNotMatch(reference, /^(?:[a-z][a-z0-9+.-]*:|\/)/i, `${path}: ${reference} není relativní cesta`);
    }
    assert.doesNotMatch(content, /https?:\/\//, `${path} obsahuje adresu s doménou`);
  }
});

test('společné soubory, na které stránky odkazují, ve výstupu existují', async () => {
  for (const [page, dir] of [['index.html', ''], ['en/index.html', 'en']]) {
    const content = await read(page);
    const references = [...content.matchAll(/(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
    for (const reference of references) {
      await assert.doesNotReject(readFile(join(outDir, dir, reference)), `${page}: ${reference} ve výstupu chybí`);
    }
  }
});

test('stránka předává Scalaru prostředí z environments.json, PROD jako výchozí', async () => {
  const content = await read('index.html');
  const sources = JSON.parse(/sources: (\[.*\]),/.exec(content)[1]);

  assert.deepEqual(sources.map(({ slug, default: isDefault }) => [slug, isDefault]), [['prod', true], ['test', false]]);
});

test('stránky mají ikonu z přibalených souborů', async () => {
  assert.match(await read('index.html'), /<link rel="icon" type="image\/svg\+xml" href="assets\/favicon\.svg">/);
  assert.match(await read('en/index.html'), /<link rel="icon" type="image\/svg\+xml" href="\.\.\/assets\/favicon\.svg">/);
});

test('Inter pokrývá symboly kláves, které Scalar ukazuje u klávesových zkratek', async () => {
  const ranges = (await fontFaces()).filter((face) => face.family === 'Inter').flatMap((face) => face.ranges);

  for (const symbol of '←↑→↓↵⇧⇪⌘⌥⌃') {
    const code = symbol.codePointAt(0);
    assert.ok(ranges.some(([from, to]) => from <= code && code <= to), `Inter nepokrývá „${symbol}“`);
  }
});

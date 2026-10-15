// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import {
  FEATURE_NAMES,
  LEVEL_TEXT,
  MESSAGES,
  PHENOMENON_NAMES,
  SKY,
  TEXT,
  WEEKDAYS,
  message,
} from '../src/i18n.js';
import { FEATURES } from '../src/devices.js';
import { PHENOMENA } from '../src/aemet/warnings.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 400,
  message: 200,
  short: 24,
  featureName: 40,
  sky: 60,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : /^manifest\.config_schema\[\d+\]\.description$/.test(path)
              ? 1000 // a section text: the core allows 1000 characters
              : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const field = manifest.config_schema.find((f) => f.key === 'language');
  assert.deepEqual(
    field.options.map((o) => o.value),
    LANGS,
  );
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 45, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the manifest name is the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('the fixed texts of the code have the four languages', () => {
  // The widget labels are short; the rest are messages.
  const short = new Set([
    'now',
    'today',
    'rain',
    'wind',
    'uv',
    'temperature',
    'noWarning',
    'inForce',
    'from',
    'until',
    'attribution',
  ]);
  const found = Object.entries(TEXT).flatMap(([key, value]) =>
    problems(value, `TEXT.${key}`, short.has(key) ? MAX.short : MAX.message),
  );
  assert.deepEqual(found, []);
});

test('the feature names exist in every language, one per feature', () => {
  assert.deepEqual(tableProblems(FEATURE_NAMES, 'FEATURE_NAMES', MAX.featureName), []);
  assert.deepEqual(sorted(Object.keys(FEATURE_NAMES.en)), sorted(FEATURES.map((f) => f.name)));
  for (const lang of LANGS) {
    const names = Object.values(FEATURE_NAMES[lang]);
    assert.equal(new Set(names).size, names.length, `${lang}: two features with the same name`);
  }
});

test('the sky states, phenomena, levels and week days exist in every language', () => {
  assert.deepEqual(tableProblems(SKY, 'SKY', MAX.sky), []);
  assert.deepEqual(tableProblems(PHENOMENON_NAMES, 'PHENOMENON_NAMES', MAX.short), []);
  assert.deepEqual(sorted(Object.keys(PHENOMENON_NAMES.en)), sorted(PHENOMENA));
  assert.deepEqual(tableProblems(LEVEL_TEXT, 'LEVEL_TEXT', MAX.short), []);
  assert.deepEqual(tableProblems(WEEKDAYS, 'WEEKDAYS', 6), []);
});

test('the scene trigger offers every phenomenon the code knows', () => {
  const field = manifest.scene_triggers[0].fields.find((f) => f.key === 'phenomenon');
  assert.deepEqual(
    field.options.map((o) => o.value),
    PHENOMENA,
  );
});

test('the messages built from values exist in every language', () => {
  const samples = {
    townAdded: ['Getafe', '28065', 0.7],
    townKnown: ['Getafe', '28065', 0.7],
    testOk: ['Getafe (28065)'],
    testTownFailed: ['28999', 'HTTP 404'],
    invalidTowns: ['nope'],
    stationFor: ['Getafe', 'MADRID RETIRO', 12.7],
    noStationFor: ['Getafe'],
  };
  assert.deepEqual(sorted(Object.keys(MESSAGES.en)), sorted(Object.keys(samples)));
  const render = (key) => (fn) => fn(...samples[key]);
  for (const key of Object.keys(samples)) {
    assert.deepEqual(problems(message(key, ...samples[key]), key, 250), [], key);
    for (const lang of LANGS) {
      assert.equal(typeof MESSAGES[lang][key], 'function', `${lang}.${key}`);
      assert.deepEqual(textProblems(render(key)(MESSAGES[lang][key]), key, lang, 250), []);
    }
  }
});

test('the four documentations have the same sections', async () => {
  const headings = {};
  for (const lang of LANGS) {
    const text = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(text.length >= 300, `docs/${lang}.md is too short`);
    headings[lang] = text
      .split('\n')
      .filter((line) => /^#{2,3} /.test(line))
      .map((line) => line.match(/^#+/)[0]);
    assert.ok(headings[lang].length >= 8, `docs/${lang}.md: ${headings[lang].length} sections`);
    assert.match(text, /AEMET/);
    if (lang === 'de') {
      for (const line of text.split('\n')) {
        assert.ok(!POLITE_GERMAN.test(line), `docs/de.md uses the polite form: ${line}`);
      }
    }
  }
  for (const lang of LANGS) {
    assert.deepEqual(
      headings[lang],
      headings.en,
      `docs/${lang}.md: not the sections of docs/en.md`,
    );
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: 'Licht' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: '', es: 'Luz' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of [
    'Wählen Sie',
    'Ihr Gerät',
    'Ihre IP',
    'mit Ihrem',
    'Ihren',
    'Ihrer',
    'Ihres',
  ]) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.actions[1].fields[0].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.actions[1].fields[0].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

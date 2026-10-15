// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/app.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { WARNING_TRIGGER, WIDGET_KEY } from '../src/hub.js';
import { WIDGETS } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered } = await createWorld({ connect: false });
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 2, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cloud transport, environment category, house location', () => {
  assert.equal(manifest.name, 'AEMET');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-aemet:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-aemet/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment']);
  // "Find the nearest town" reads the coordinates of the houses.
  assert.equal(manifest.location, true);
  for (const lang of ['en', 'fr', 'de', 'es']) {
    assert.match(
      manifest.config_schema[0].description[lang],
      /AEMET[^.]*\.$/,
      `${lang}: "not affiliated" last`,
    );
  }
});

test('every manifest action has a registered handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), [...ACTIONS].sort());
  assert.deepEqual(handlerKeys('action:').sort(), [...ACTIONS].sort());
});

test('an action never takes a secret, and its required fields need no default', () => {
  // Gladys#3154/#3155: a secret action field cannot be filled, and an action
  // applies no default while requiring the required fields.
  for (const action of manifest.actions) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret', `${action.key}.${field.key}`);
      assert.equal(field.default, undefined, `${action.key}.${field.key}`);
    }
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), [4, 86, 0]));
});

test('scene triggers and widgets require Gladys >= 5.1.0, a houses select 5.2.0', () => {
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]));
  assert.ok(allFields.some((f) => f.source === 'houses'));
  assert.ok(isAtLeast(minGladysVersion(), [5, 2, 0]), 'source "houses" needs Gladys 5.2.0');
});

test('the scene trigger is the one the code fires; no scene action', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [WARNING_TRIGGER]);
  assert.equal(manifest.scene_actions, undefined);
  assert.deepEqual(handlerKeys('sceneAction:'), []);
});

test('the trigger variables are the keys the event carries', async () => {
  const { warningEvent } = await import('../src/hub.js');
  const data = warningEvent(
    {
      level: 2,
      phenomenon: 'wind',
      onset: '2021-01-09T10:00:00Z',
      expires: '2021-01-09T20:00:00Z',
      headline: 'h',
    },
    'ext:test:town:28065',
    { name: 'Getafe' },
    'Europe/Madrid',
    'en',
    new Date('2021-01-09T12:00:00Z'),
  );
  const trigger = manifest.scene_triggers[0];
  const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
  assert.deepEqual(Object.keys(data).sort(), [...new Set(declared)].sort());
  const levels = trigger.fields.find((f) => f.key === 'level').options.map((o) => o.value);
  assert.deepEqual(levels, ['yellow', 'orange', 'red']);
  assert.ok(levels.includes(data.level));
  assert.ok(Object.keys(data).length <= 30);
});

test('every widget key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.ok(['devices', 'houses'].includes(field.source), field.key);
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang} has ${text.length}`);
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en);
  }
});

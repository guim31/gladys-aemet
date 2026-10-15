// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// fixtures (Getafe, a station 13 km away), in every feature-name language,
// and for a town without any station within 40 km.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultRoutes } from './helpers/aemet.js';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const noStation = () => {
  const routes = defaultRoutes();
  routes['observacion/convencional/todas'] = [];
  return routes;
};

const scenarios = [
  { label: 'French names (default)', config: {} },
  { label: 'English names', config: { language: 'en' } },
  { label: 'German names', config: { language: 'de' } },
  { label: 'Spanish names', config: { language: 'es' } },
  { label: 'no station within 40 km', config: {}, routes: noStation() },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { gladys, hub } = await createWorld({ config: scenario.config, routes: scenario.routes });
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, 1);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }

      // Every published state belongs to a declared feature, inside its bounds.
      const features = new Map(devices.flatMap((d) => d.features).map((f) => [f.external_id, f]));
      for (const state of gladys.fake.states) {
        const feature = features.get(state.device_feature_external_id);
        assert.ok(feature, `${state.device_feature_external_id}: no such feature`);
        if (feature.category === 'text') {
          assert.ok(typeof state.text === 'string' && state.text.length > 0);
        } else {
          assert.ok(state.state >= feature.min && state.state <= feature.max, feature.name);
        }
      }
    } finally {
      await hub.stop();
    }
  });
}

test('the device is read only: nothing to command', async () => {
  const { gladys, hub } = await createWorld();
  for (const feature of gladys.fake.discoveredDevices[0].features) {
    assert.equal(feature.read_only, true, feature.name);
  }
  await hub.stop();
});

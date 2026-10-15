// -----------------------------------------------------------------------------
// The Configuration screen actions: "Test the connection" and "Find the
// nearest town" (from a Gladys house, written into the `towns` field).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY } from './helpers/aemet.js';
import { createWorld } from './helpers/world.js';

test('"Test the connection" names the towns and their station', async () => {
  const { gladys, hub } = await createWorld({ config: { towns: '28065, 28999, nope' } });
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.fr,
    [
      'AEMET répond. Communes : Getafe (28065).',
      'Getafe : station MADRID RETIRO (12.7 km)',
      'Commune 28999 : HTTP 404: No hay datos que satisfagan esos criterios',
      'Codes ignorés (5 chiffres attendus) : nope.',
    ].join('\n'),
  );
  for (const lang of ['en', 'de', 'es']) {
    assert.ok(ack.data.message[lang].includes('Getafe'), lang);
  }
  await hub.stop();
});

test('"Test the connection" with a refused key says so', async () => {
  const { gladys, hub } = await createWorld({ config: { api_key: 'wrong' } });
  const ack = await gladys.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /refused the API key/);
  await hub.stop();
});

test('"Find the nearest town" adds it to the configuration and publishes its device', async () => {
  const { gladys, hub } = await createWorld({ config: { towns: '' } });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  const ack = await gladys.fake.action('find_town', { house: 'casa-getafe' });
  assert.match(ack.data.message.fr, /^Getafe \(INE 28065, à 0.7 km\) ajoutée/);
  assert.equal(gladys.fake.config.towns, '28065');
  assert.equal(gladys.fake.discoveredDevices.length, 1);

  const again = await gladys.fake.action('find_town', { house: 'casa-getafe' });
  assert.match(again.data.message.en, /already in the configuration/);
  assert.equal(gladys.fake.config.towns, '28065');
  await hub.stop();
});

test('"Find the nearest town" refuses a house without position, or outside Spain', async () => {
  const { gladys, hub } = await createWorld();
  assert.match(
    (await gladys.fake.action('find_town', { house: 'lyon' })).data.message.en,
    /only covers Spain/,
  );
  assert.match(
    (await gladys.fake.action('find_town', { house: 'nowhere' })).data.message.en,
    /no position/,
  );
  assert.match(
    (await gladys.fake.action('find_town', { house: 'gone' })).data.message.en,
    /no position/,
  );
  await hub.stop();
});

test('"Find the nearest town" keeps five towns at most', async () => {
  const { gladys, hub } = await createWorld({
    config: { api_key: KEY, towns: '28001, 28002, 28003, 28004, 28005' },
  });
  assert.match(
    (await gladys.fake.action('find_town', { house: 'casa-getafe' })).data.message.en,
    /Five towns at most/,
  );
  await hub.stop();
});

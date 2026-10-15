// -----------------------------------------------------------------------------
// The refresh loop, against the SDK's fake Gladys and the fake AEMET: the
// container refreshes by itself (Gladys#3198), at the pace the quota allows,
// sends only what changed, says a failure once, and fires the "new warning"
// trigger once per warning.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { TIMINGS, WARNING_TRIGGER, WIDGET_KEY } from '../src/hub.js';
import { MemoryStore } from '../src/store.js';
import { CAP_FILES, KEY, defaultRoutes, makeTar } from './helpers/aemet.js';
import { GETAFE, createWorld, settle } from './helpers/world.js';

const MINUTE = 60_000;
const feature = (gladys, key) => `${gladys.externalId(`town:${GETAFE}`)}:${key}`;
const count = (aemet, fragment) => aemet.calls.filter((path) => path.includes(fragment)).length;

/** Capture the log lines (the SDK logger writes to console.log / console.error). */
function captureLogs(t, level) {
  const previous = process.env.LOG_LEVEL;
  if (level) {
    process.env.LOG_LEVEL = level;
  } else {
    delete process.env.LOG_LEVEL; // the default: info
  }
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  const lines = [];
  for (const stream of ['log', 'error', 'warn', 'info', 'debug']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}

async function advance(t, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += MINUTE) {
    t.mock.timers.tick(MINUTE);
    await settle();
  }
}

test('the device states are published from the fixtures', async () => {
  const { gladys, hub } = await createWorld();
  const last = (key) => gladys.fake.lastState(feature(gladys, key));
  assert.equal(last('temperature'), 0);
  assert.equal(last('feels-like'), -4);
  assert.equal(last('rain-probability'), 100);
  assert.equal(last('sky'), 'Couvert avec neige');
  assert.equal(last('uv-index'), 1);
  assert.equal(last('warning-level'), 3);
  assert.equal(last('warning-upcoming'), 3);
  assert.equal(last('warnings'), 'Rouge: Neige; Orange: Grand froid (dès lun. 00:00)');
  assert.equal(last('station-temperature'), -0.7);
  assert.equal(last('station-wind'), 11.5);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  await hub.stop();
});

test('the container refreshes by itself, without any onPoll from the core (Gladys#3198)', async (t) => {
  const { gladys, hub, aemet } = await createWorld({ t, timers: true });
  t.after(() => hub.stop());
  assert.equal(count(aemet, 'horaria'), 1);
  const first = gladys.fake.states.length;

  // The hour changes: new states from the cached forecast, no download.
  await advance(t, 30 * MINUTE);
  assert.ok(gladys.fake.states.length > first, 'the 14:00 forecast is published');
  assert.equal(gladys.fake.lastState(feature(gladys, 'temperature')), 0);
  assert.equal(gladys.fake.lastState(feature(gladys, 'feels-like')), -4);
  assert.equal(count(aemet, 'horaria'), 2, 'the forecast is read again after 30 minutes');

  await advance(t, 30 * MINUTE);
  assert.equal(count(aemet, 'horaria'), 3);
  assert.equal(count(aemet, 'diaria'), 3);
  assert.equal(count(aemet, 'estacion/3195'), 3);
  assert.equal(count(aemet, 'avisos_cap'), 7, 'warnings: every 10 minutes');
  assert.equal(count(aemet, 'convencional/todas'), 1, 'the station list only once');
  assert.equal(count(aemet, 'maestro'), 1, 'the town master data only once');
});

test("the core's onPoll is a fallback: it never calls AEMET more than the timer would", async (t) => {
  const { gladys, hub, aemet } = await createWorld({ t });
  t.after(() => hub.stop());
  const [device] = gladys.fake.discoveredDevices;
  const before = aemet.calls.length;
  for (let i = 0; i < 9; i += 1) {
    t.mock.timers.tick(MINUTE);
    assert.deepEqual(await gladys.fake.poll(device), { success: true });
  }
  assert.equal(aemet.calls.length, before, 'nothing due within 9 minutes');
  t.mock.timers.tick(MINUTE);
  await gladys.fake.poll(device);
  assert.deepEqual(aemet.calls.slice(before), ['avisos_cap/ultimoelaborado/area/72']);
});

test('only the towns added to Gladys are read', async () => {
  const { gladys, hub, aemet } = await createWorld({ create: false });
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(count(aemet, 'prediccion'), 0);
  assert.equal(gladys.fake.states.length, 0);
  await hub.stop();
});

test('a device just added gets all its states at once, and the widget is nudged', async (t) => {
  const { gladys, hub, aemet } = await createWorld({ t });
  t.after(() => hub.stop());
  const first = gladys.fake.states.length;
  const refreshes = gladys.fake.widgetRefreshes.length;
  t.mock.timers.tick(5_000);
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  assert.equal(gladys.fake.states.length, first * 2, 'everything sent again');
  assert.equal(count(aemet, 'horaria'), 1, 'from the cache: no new download');
  assert.ok(gladys.fake.widgetRefreshes.slice(refreshes).includes(WIDGET_KEY));
});

test('only the values that changed are sent, and every value once per heartbeat', async (t) => {
  const { gladys, hub } = await createWorld({ t, timers: true });
  t.after(() => hub.stop());
  await advance(t, 30 * MINUTE); // past 14:00
  const settled = gladys.fake.states.length;
  await advance(t, 20 * MINUTE);
  assert.equal(gladys.fake.states.length, settled, 'same hour, same data: nothing sent');
  assert.ok(TIMINGS.heartbeat <= 12 * 60 * MINUTE);
  // Freeze the forecast clock: the next hours would change the values anyway.
  hub.towns.get(GETAFE).due.forecast = Infinity;
  // The station ones go quiet: the fake station never gets a newer reading.
  const ids = gladys.fake.states
    .slice(0, 20)
    .map((s) => s.device_feature_external_id)
    .filter((id) => !id.includes(':station-'));
  assert.ok(ids.length >= 14);
  await advance(t, TIMINGS.heartbeat);
  const resent = new Set(
    gladys.fake.states.slice(settled).map((s) => s.device_feature_external_id),
  );
  assert.ok(
    ids.every((id) => resent.has(id)),
    'every feature sent again within the heartbeat',
  );
});

test('a failing AEMET is said once, and its return once', async (t) => {
  const lines = captureLogs(t);
  let down = false;
  const routes = defaultRoutes();
  const hourly = routes['prediccion/especifica/municipio/horaria/28065'];
  routes['prediccion/especifica/municipio/horaria/28065'] = () =>
    down ? { status: 500, body: { estado: 500, descripcion: 'Error interno' } } : hourly;
  const { hub, gladys } = await createWorld({ t, timers: true, routes });
  t.after(() => hub.stop());
  lines.length = 0;

  down = true;
  await advance(t, 60 * MINUTE); // several failed attempts, 5 minutes apart
  const warnings = lines.filter((l) => l.includes('[WARN]'));
  assert.equal(warnings.length, 1, warnings.join('\n'));
  assert.match(warnings[0], /Getafe: forecast: reading failed \(HTTP 500: Error interno\)/);

  down = false;
  await advance(t, 10 * MINUTE);
  const infos = lines.filter((l) => l.includes('[INFO]'));
  assert.equal(infos.length, 1, infos.join('\n'));
  assert.match(infos[0], /Getafe: forecast: read again/);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a refused key is shown on the Configuration screen', async () => {
  const { gladys, hub, aemet } = await createWorld({ config: { api_key: 'not-the-key' } });
  assert.equal(gladys.fake.discoveredDevices.length, 0, 'the town name is unknown');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /refusé la clé/);
  assert.equal(count(aemet, 'maestro'), 1);
  await hub.stop();
});

test('a missing key or town is shown on the Configuration screen', async () => {
  let world = await createWorld({ config: { api_key: '' } });
  assert.match(world.gladys.fake.connectionStatus.message.en, /API key/);
  assert.equal(world.aemet.calls.length, 0);
  await world.hub.stop();
  world = await createWorld({ config: { towns: '' } });
  assert.match(world.gladys.fake.connectionStatus.message.en, /Add a town/);
  await world.hub.stop();
});

test('a quota refusal waits 15 minutes before asking again', async (t) => {
  let refused = true;
  const routes = defaultRoutes();
  const data = routes['observacion/convencional/datos/estacion/3195'];
  routes['observacion/convencional/datos/estacion/3195'] = () =>
    refused ? { status: 429, body: { estado: 429, descripcion: 'Límite' } } : data;
  const { gladys, hub, aemet } = await createWorld({ t, timers: true, routes });
  t.after(() => hub.stop());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /limits the requests/);
  await advance(t, 14 * MINUTE);
  assert.equal(count(aemet, 'estacion/3195'), 1);
  refused = false;
  await advance(t, MINUTE);
  assert.equal(count(aemet, 'estacion/3195'), 2);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a normal cycle writes nothing at info level, and no secret at any level', async (t) => {
  const lines = captureLogs(t, 'debug');
  const { hub } = await createWorld({ t, timers: true });
  t.after(() => hub.stop());
  await advance(t, 90 * MINUTE);
  assert.ok(
    lines.some((l) => l.includes('[DEBUG]')),
    'the cycles are visible at debug',
  );
  const loud = lines.filter((l) => !l.includes('[DEBUG]') && !/Connected to AEMET/.test(l));
  assert.deepEqual(loud, []);
  assert.ok(!lines.some((l) => l.includes(KEY)), 'the API key is never logged');
  assert.ok(!lines.some((l) => l.includes('opendata/sh/')), 'nor the data URLs');
});

// --- The "new warning" trigger ------------------------------------------------------

function warningRoutes(files) {
  const routes = defaultRoutes();
  routes['avisos_cap/ultimoelaborado/area/72'] = () => ({ binary: gzipSync(makeTar(files())) });
  return routes;
}

test('the warnings in force at the first reading are known, not announced', async () => {
  const { gladys, hub, store } = await createWorld();
  assert.deepEqual(gladys.fake.sceneEvents, []);
  await hub.stop();
  assert.equal(Object.keys(store.data.warnings[GETAFE]).length, 2);
});

test('a new warning, or a higher level, fires the trigger once', async (t) => {
  let files = CAP_FILES.filter((f) => !f.name.includes('BTNA'));
  const { gladys, hub } = await createWorld({
    t,
    timers: true,
    routes: warningRoutes(() => files),
  });
  t.after(() => hub.stop());
  assert.deepEqual(gladys.fake.sceneEvents, []);

  files = CAP_FILES; // AEMET adds the orange cold warning of the 11th
  await advance(t, 10 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 1);
  const [event] = gladys.fake.sceneEvents;
  assert.equal(event.key, WARNING_TRIGGER);
  assert.deepEqual(event.data, {
    device: gladys.externalId(`town:${GETAFE}`),
    town: 'Getafe',
    level: 'orange',
    phenomenon: 'cold',
    summary: 'Getafe — Orange: Grand froid, dès lun. 00:00 jusqu’à lun. 10:59',
    headline: 'Aviso naranja por temperaturas mínimas. Metropolitana y Henares',
    onset: '2021-01-10T23:00:00.000Z',
    expires: '2021-01-11T09:59:59.000Z',
    in_force: false,
  });

  await advance(t, 30 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 1, 'never twice');

  // AEMET raises it to red.
  files = CAP_FILES.map((f) =>
    f.name.includes('BTNA')
      ? { ...f, content: f.content.replaceAll('<value>naranja', '<value>rojo') }
      : f,
  );
  await advance(t, 10 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 2);
  assert.equal(gladys.fake.sceneEvents[1].data.level, 'red');
});

test('a restart does not announce the known warnings again', async (t) => {
  let files = CAP_FILES.filter((f) => !f.name.includes('BTNA'));
  const store = new MemoryStore();
  const first = await createWorld({ t, store, routes: warningRoutes(() => files) });
  await first.hub.stop();
  t.mock.timers.reset();

  files = CAP_FILES;
  const second = await createWorld({ t, store, routes: warningRoutes(() => files) });
  t.after(() => second.hub.stop());
  assert.equal(second.gladys.fake.sceneEvents.length, 1, 'only the new one');
  assert.equal(second.gladys.fake.sceneEvents[0].data.phenomenon, 'cold');
  assert.equal(count(second.aemet, 'convencional/todas'), 0, 'the station comes from /data');
});

test('a new language sends every text again in that language', async () => {
  const { gladys, hub } = await createWorld();
  await gladys.fake.configUpdated({ api_key: KEY, towns: GETAFE, language: 'es' });
  assert.equal(gladys.fake.lastState(feature(gladys, 'sky')), 'Cubierto con nieve');
  assert.equal(
    gladys.fake.lastState(feature(gladys, 'warnings')),
    'Rojo: Nevadas; Naranja: Temperaturas mínimas (desde lun, 00:00)',
  );
  assert.equal(gladys.fake.discoveredDevices[0].features[0].name, 'Temperatura (previsión)');
  await hub.stop();
});

test('a town removed from the configuration is no longer read', async (t) => {
  const { gladys, hub, aemet } = await createWorld({ t, timers: true });
  t.after(() => hub.stop());
  await gladys.fake.configUpdated({ api_key: KEY, towns: '', language: 'fr' });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  const before = aemet.calls.length;
  await advance(t, 40 * MINUTE);
  assert.equal(aemet.calls.length, before);
});

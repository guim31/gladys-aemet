// -----------------------------------------------------------------------------
// A connected integration against the SDK's fake Gladys and the fake AEMET,
// at 13:30 in Madrid on 9 January 2021 (the day of the fixtures).
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { KEY, createAemetFetch } from './aemet.js';

export const NOW = Date.parse('2021-01-09T12:30:00Z');
export const GETAFE = '28065';

export const HOUSES = [
  { id: 'h1', name: 'Casa Getafe', selector: 'casa-getafe', latitude: 40.31, longitude: -3.73 },
  { id: 'h2', name: 'Lyon', selector: 'lyon', latitude: 45.76, longitude: 4.84 },
  { id: 'h3', name: 'Nowhere', selector: 'nowhere', latitude: null, longitude: null },
];

/**
 * @param {object} [options]
 * @param {object} [options.config] the raw config (manifest keys)
 * @param {boolean} [options.connect] connect (default true)
 * @param {boolean} [options.create] add the discovered devices to Gladys (default true)
 * @param {boolean} [options.timers] run the internal timer (default false)
 * @param {object} [options.routes] fake AEMET routes
 * @param {object} [options.store] persisted state
 * @param {import('node:test').TestContext} [options.t] to mock the clock (setTimeout + Date)
 */
export async function createWorld({
  config = {},
  connect = true,
  create = true,
  timers = false,
  routes,
  store = new MemoryStore(),
  t,
} = {}) {
  if (t) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW });
  }
  const aemet = createAemetFetch(routes);
  const gladys = createFakeGladys({
    config: { api_key: KEY, towns: GETAFE, language: 'fr', ...config },
    houses: HOUSES,
  });
  const hub = registerHandlers(gladys, {
    fetch: aemet.fetch,
    store,
    timers,
    now: t ? undefined : () => NOW,
  });
  if (connect) {
    await gladys.connect();
    if (create) {
      for (const device of gladys.fake.discoveredDevices) {
        await gladys.fake.deviceCreated(device);
      }
    }
  }
  return { gladys, hub, aemet, store };
}

/** Let the work started by a fired timer run to its end. */
export async function settle() {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe the real AEMET OpenData API with the integration's own client, read
// only. Prints statuses and shapes, never the key nor the data URLs.
//
//   node scripts/probe.mjs                       # a fake key: shows the refusal
//   AEMET_API_KEY=... node scripts/probe.mjs     # a real key: the whole chain
//   AEMET_API_KEY=... node scripts/probe.mjs 28079 --save /tmp/aemet
//
// With a real key it reads, for one town (Madrid by default): the master
// data, the hourly and daily forecasts, the nearest station and its last
// observation, the warnings of its region, and prints what the integration
// would publish. `--save <dir>` writes the raw answers there (public data),
// to refresh the fixtures of test/fixtures/aemet.
// About 14 requests: far below the quota of a key.
// -----------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AemetClient } from '../src/aemet/client.js';
import {
  currentHour,
  forecastDays,
  latestObservation,
  nearestStation,
  townInfo,
} from '../src/aemet/forecast.js';
import { townTimeZone } from '../src/aemet/geo.js';
import { extractDocuments, parseCap, regionOfZone, warningsFor } from '../src/aemet/warnings.js';

const args = process.argv.slice(2);
const saveAt = args.indexOf('--save');
const saveDir = saveAt >= 0 ? args[saveAt + 1] : null;
const code = args.find((arg) => /^\d{5}$/.test(arg)) ?? '28079';
const realKey = process.env.AEMET_API_KEY?.trim();
const apiKey = realKey || 'probe-fake-key-0000';

const client = new AemetClient({ apiKey });
const now = new Date();

function shape(value, depth = 0) {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[${value.length} × ${shape(value[0], depth + 1)}]`;
  }
  if (value && typeof value === 'object') {
    if (depth > 1) {
      return '{…}';
    }
    return `{ ${Object.keys(value).slice(0, 12).join(', ')}${Object.keys(value).length > 12 ? ', …' : ''} }`;
  }
  return typeof value;
}

async function save(name, data) {
  if (!saveDir) {
    return;
  }
  await mkdir(saveDir, { recursive: true });
  await writeFile(
    join(saveDir, name),
    Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2),
  );
}

let lastError = null;

async function step(label, run) {
  const started = Date.now();
  try {
    const result = await run();
    console.log(`✔ ${label} (${Date.now() - started} ms)`);
    return result;
  } catch (err) {
    lastError = err;
    console.log(`✘ ${label}: ${err.kind ?? 'error'} — ${err.message}`);
    return undefined;
  }
}

console.log(`AEMET probe, town ${code}, ${realKey ? 'key from AEMET_API_KEY' : 'FAKE key'}`);

const rawTown = await step('master data of the town', async () => {
  const data = await client.get(`maestro/municipio/id${code}`);
  await save(`town-id${code}.json`, data);
  return Array.isArray(data) ? data[0] : data;
});
if (!rawTown) {
  if (lastError?.kind === 'auth') {
    console.log(
      realKey
        ? 'AEMET refused the key: nothing more to read.'
        : 'Refused as expected with a fake key. Set AEMET_API_KEY to read the real data.',
    );
    process.exit(realKey ? 1 : 0);
  }
  console.log('AEMET could not be read (see above): network, quota or town code.');
  process.exit(1);
}
const town = townInfo(rawTown, code);
const timeZone = townTimeZone(code);
console.log(`  ${town.name}, ${town.lat}, ${town.lon}, warning zone ${town.zone}`);

const hourly = await step('hourly forecast', async () => {
  const data = await client.hourlyForecast(code);
  await save(`town-${code}-forecast-hourly-data.json`, data);
  console.log(`  shape: ${shape(data)}`);
  return data;
});
if (hourly) {
  console.log('  current hour:', currentHour(hourly, now, timeZone));
}

const daily = await step('daily forecast', async () => {
  const data = await client.dailyForecast(code);
  await save(`town-${code}-forecast-daily-data.json`, data);
  return data;
});
if (daily) {
  console.log('  days:', forecastDays(daily, now, timeZone).slice(0, 3));
}

const stations = await step('station list (several MB)', () => client.stations());
const station = stations && nearestStation(stations, town.lat, town.lon);
console.log('  nearest station:', station);
if (station) {
  const samples = await step(`observation of station ${station.id}`, async () => {
    const data = await client.station(station.id);
    await save(`station-${station.id}-data.json`, data);
    return data;
  });
  if (samples) {
    console.log('  latest:', latestObservation(samples, now));
  }
}

const region = regionOfZone(town.zone);
if (region) {
  const archive = await step(`warnings of region ${region}`, async () => {
    try {
      return await client.warnings(region);
    } catch (err) {
      if (err.kind === 'no-data') {
        console.log('  (no warning file: no warning in the region)');
        return Buffer.alloc(0);
      }
      throw err;
    }
  });
  if (archive?.length) {
    await save(`warnings-${region}.bin`, archive);
    const documents = extractDocuments(archive);
    console.log(`  ${archive.length} bytes, ${documents.length} CAP file(s)`);
    const all = documents.flatMap(parseCap);
    console.log(
      `  levels: ${[...new Set(all.map((w) => w.level))].join(', ') || '-'}; phenomena: ${[...new Set(all.map((w) => `${w.phenomenonCode}=${w.phenomenon}`))].join(', ') || '-'}`,
    );
    console.log(
      '  for this town:',
      warningsFor(documents, town, now).map((w) => [w.level, w.phenomenon, w.onset, w.expires]),
    );
  }
}

console.log(
  `Requests left on the key (Remaining-request-count): ${client.remaining ?? 'not sent'}`,
);

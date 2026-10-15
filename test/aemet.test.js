// -----------------------------------------------------------------------------
// The AEMET layer, against the Home Assistant fixtures (Getafe, 9 January
// 2021) and CAP warnings: the two-step client, the forecast of the current
// hour, the observations, the warnings archive.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { AemetClient, ERROR_KINDS } from '../src/aemet/client.js';
import {
  currentHour,
  forecastDays,
  latestObservation,
  nearestStation,
  nearestTown,
  num,
  townInfo,
} from '../src/aemet/forecast.js';
import { insidePolygon, localParts, townTimeZone, zonedTime } from '../src/aemet/geo.js';
import {
  extractDocuments,
  isActive,
  parseCap,
  phenomenonOf,
  regionOfZone,
  warningsFor,
} from '../src/aemet/warnings.js';
import { CAP_FILES, KEY, createAemetFetch, fixture, makeTar } from './helpers/aemet.js';

const MADRID = 'Europe/Madrid';
const at = (iso) => new Date(iso);
const hourly = fixture('town-28065-forecast-hourly-data.json');
const daily = fixture('town-28065-forecast-daily-data.json');
const getafe = townInfo(fixture('town-id28065.json')[0], '28065');

// --- Client --------------------------------------------------------------------

test('the client follows the data URL, with the key in a header only', async () => {
  const aemet = createAemetFetch();
  const client = new AemetClient({ apiKey: KEY, fetch: aemet.fetch });
  const data = await client.hourlyForecast('28065');
  assert.equal(data[0].nombre, 'Getafe');
  assert.equal(aemet.requests.length, 2, 'the envelope, then the data');
  assert.equal(aemet.requests[0].headers.api_key, KEY);
  assert.equal(aemet.requests[1].headers.api_key, undefined, 'the data URL never gets the key');
  for (const { url } of aemet.requests) {
    assert.ok(!url.includes(KEY), 'the key is never in a URL');
  }
});

test('the data files are decoded from ISO-8859-15', async () => {
  const name = 'Leganés, Alcalá de Henares, Móstoles';
  const fetchImpl = async (url) =>
    url.includes('/sh/')
      ? new Response(Buffer.from(JSON.stringify([{ nombre: name }]), 'latin1'), {
          headers: { 'content-type': 'text/plain' }, // no charset: ISO-8859-15 assumed
        })
      : Response.json({ estado: 200, datos: 'https://opendata.aemet.es/opendata/sh/1' });
  const client = new AemetClient({ apiKey: 'k', fetch: fetchImpl });
  assert.equal((await client.dailyForecast('28074'))[0].nombre, name);
});

test('a refused key, a quota and a missing data set are told apart', async () => {
  const aemet = createAemetFetch({
    'maestro/municipio/id28079': { status: 429, body: { estado: 429, descripcion: 'Límite' } },
  });
  await assert.rejects(new AemetClient({ apiKey: 'wrong', fetch: aemet.fetch }).town('28065'), {
    kind: ERROR_KINDS.AUTH,
  });
  const client = new AemetClient({ apiKey: KEY, fetch: aemet.fetch });
  await assert.rejects(client.town('28079'), { kind: ERROR_KINDS.QUOTA });
  await assert.rejects(client.warnings('61'), { kind: ERROR_KINDS.NO_DATA });

  // A refusal inside an HTTP 200 envelope.
  const envelope401 = async () => Response.json({ estado: 401, descripcion: 'API key invalido' });
  await assert.rejects(new AemetClient({ apiKey: KEY, fetch: envelope401 }).town('28065'), {
    kind: ERROR_KINDS.AUTH,
  });
});

test('the client only follows a data URL of AEMET itself', async () => {
  const fetchImpl = async () =>
    Response.json({ estado: 200, datos: 'https://attacker.example/steal' });
  await assert.rejects(new AemetClient({ apiKey: KEY, fetch: fetchImpl }).station('3195'), {
    kind: ERROR_KINDS.FORMAT,
  });
});

test('a network failure never shows the key', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  };
  const err = await new AemetClient({ apiKey: KEY, fetch: fetchImpl })
    .town('28065')
    .catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.NETWORK);
  assert.match(err.message, /ENOTFOUND/);
  assert.ok(!err.message.includes(KEY));
});

// --- Clock and places --------------------------------------------------------------

test('forecast times are read in the town zone, the Canary Islands one hour behind', () => {
  assert.equal(townTimeZone('28065'), MADRID);
  assert.equal(townTimeZone('35016'), 'Atlantic/Canary');
  assert.equal(townTimeZone('38038'), 'Atlantic/Canary');
  assert.deepEqual(localParts(at('2021-01-09T12:30:00Z'), MADRID).hour, 13);
  assert.deepEqual(localParts(at('2021-01-09T12:30:00Z'), 'Atlantic/Canary').hour, 12);
  assert.equal(zonedTime('2021-01-09', 7, MADRID).toISOString(), '2021-01-09T06:00:00.000Z');
  assert.equal(zonedTime('2021-07-09', 7, MADRID).toISOString(), '2021-07-09T05:00:00.000Z');
  assert.equal(zonedTime('2021-01-09', 24, MADRID).toISOString(), '2021-01-09T23:00:00.000Z');
});

test('a point is inside or outside a CAP polygon', () => {
  const square = '40.62,-3.92 40.62,-3.20 40.05,-3.20 40.05,-3.92 40.62,-3.92';
  assert.equal(insidePolygon(40.304, -3.729, square), true);
  assert.equal(insidePolygon(41.0, -3.729, square), false);
  assert.equal(insidePolygon(40.304, -3.729, 'garbage'), false);
});

test('AEMET values become numbers: "Ip" is a trace, "-0" is 0, "" is unknown', () => {
  assert.equal(num('Ip'), 0);
  assert.ok(Object.is(num('-0'), 0));
  assert.equal(num(''), null);
  assert.equal(num(['28']), 28);
  assert.equal(num('n/a'), null);
});

// --- Forecasts -------------------------------------------------------------------

test('the forecast of the current hour (13:00 in Getafe)', () => {
  const hour = currentHour(hourly, at('2021-01-09T12:30:00Z'), MADRID);
  assert.deepEqual(
    { ...hour },
    {
      temperature: 0,
      feelsLike: -4,
      humidity: 100,
      precipitation: 1.5,
      rainProbability: 100,
      windSpeed: 15,
      windDirection: 135,
      windGust: 22,
      sky: { code: '36', night: false },
      skyText: 'Cubierto con nieve',
    },
  );
});

test('just after midnight, the chance of rain is the "1901" window of the day before', () => {
  const hour = currentHour(hourly, at('2021-01-09T23:30:00Z'), MADRID); // 00:30 on the 10th
  assert.ok(hour, 'the 10th is in the forecast');
  const previousEvening = hourly[0].prediccion.dia[0].probPrecipitacion.find(
    (p) => p.periodo === '1901',
  );
  assert.equal(hour.rainProbability, num(previousEvening.value));
});

test('an hour the forecast does not cover gives nothing', () => {
  assert.equal(currentHour(hourly, at('2021-01-20T12:00:00Z'), MADRID), null);
  assert.equal(currentHour([], at('2021-01-09T12:00:00Z'), MADRID), null);
});

test('the days of the daily forecast, from today', () => {
  const days = forecastDays(daily, at('2021-01-09T12:30:00Z'), MADRID);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], {
    date: '2021-01-09',
    min: -1,
    max: 2,
    rainProbability: 100,
    sky: { code: '36', night: false },
    uv: 1,
  });
  assert.equal(forecastDays(daily, at('2021-01-11T12:00:00Z'), MADRID)[0].date, '2021-01-11');
});

// --- Observations ---------------------------------------------------------------

test('the latest observation, wind converted from m/s to km/h', () => {
  const samples = fixture('station-3195-data.json');
  const observation = latestObservation(samples, at('2021-01-09T12:30:00Z'));
  assert.deepEqual(observation, {
    at: '2021-01-09T12:00:00.000Z',
    station: '3195',
    temperature: -0.7,
    humidity: 99,
    pressure: 1004.4, // sea level
    precipitation: 7,
    windSpeed: 11.5, // 3.2 m/s
    windGust: 43.9, // 12.2 m/s
  });
  assert.equal(latestObservation(samples, at('2021-01-09T16:00:00Z')), null, 'too old');
});

test('the nearest station and town, within 40 km', () => {
  const stations = fixture('station-list-data.json');
  assert.deepEqual(nearestStation(stations, getafe.lat, getafe.lon), {
    id: '3195',
    name: 'MADRID RETIRO',
    distance: 12.7,
  });
  assert.equal(nearestStation(stations, 45.76, 4.84), null, 'Lyon is too far');
  const towns = fixture('town-list.json');
  assert.equal(nearestTown(towns, 40.31, -3.73).code, '28065');
  assert.equal(nearestTown(towns, 40.41, -3.69).code, '28079');
  assert.equal(nearestTown(towns, 45.76, 4.84), null);
});

test('the town master data: name, position, warning zone', () => {
  assert.deepEqual(getafe, {
    code: '28065',
    name: 'Getafe',
    lat: 40.30403754,
    lon: -3.72935236,
    zone: '722802',
  });
  assert.equal(regionOfZone(getafe.zone), '72');
  assert.equal(regionOfZone(null), null);
});

// --- Warnings ------------------------------------------------------------------

test('the warnings archive: a gzipped or plain tar, or a single document', () => {
  const tar = makeTar(CAP_FILES);
  assert.equal(extractDocuments(gzipSync(tar)).length, CAP_FILES.length);
  assert.equal(extractDocuments(tar).length, CAP_FILES.length);
  assert.equal(extractDocuments(Buffer.from(CAP_FILES[0].content)).length, 1);
  assert.deepEqual(extractDocuments(makeTar([{ name: 'readme.txt', content: 'x' }])), []);
});

test('a CAP file: level, phenomenon, period and zone, read from the Spanish block', () => {
  const red = CAP_FILES.find((f) => f.name.includes('NERO'));
  const [warning] = parseCap(red.content);
  assert.equal(warning.level, 3);
  assert.equal(warning.phenomenon, 'snow');
  assert.equal(warning.phenomenonCode, 'NE');
  assert.equal(warning.onset, '2021-01-08T23:00:00.000Z');
  assert.equal(warning.expires, '2021-01-09T22:59:59.000Z');
  assert.equal(warning.zone, '722802');
  assert.equal(warning.headline, 'Aviso rojo por nevadas. Metropolitana y Henares');
  assert.equal(warning.polygons.length, 1);
});

test('the warnings of a town: its zone, not over, the most severe first', () => {
  const documents = CAP_FILES.map((f) => f.content);
  const warnings = warningsFor(documents, getafe, at('2021-01-09T12:30:00Z'));
  assert.deepEqual(
    warnings.map((w) => [w.level, w.phenomenon, w.zone]),
    [
      [3, 'snow', '722802'],
      [2, 'cold', '722802'],
    ],
    'the Sierra zone is not Getafe, the wind of the 8th is over',
  );
  assert.equal(isActive(warnings[0], at('2021-01-09T12:30:00Z')), true);
  assert.equal(isActive(warnings[1], at('2021-01-09T12:30:00Z')), false, 'starts on the 11th');
});

test('without zone codes, the polygon decides; a cancelled or green warning is ignored', () => {
  const red = CAP_FILES.find((f) => f.name.includes('NERO')).content;
  const noZone = red.replace(/<geocode>[\s\S]*?<\/geocode>/, '');
  const now = at('2021-01-09T12:30:00Z');
  assert.equal(warningsFor([noZone], getafe, now).length, 1, 'Getafe is in the polygon');
  assert.equal(warningsFor([noZone], { ...getafe, lat: 41.5 }, now).length, 0);
  assert.equal(warningsFor([red], { ...getafe, zone: null }, now).length, 1, 'town without zone');
  assert.equal(
    warningsFor([red.replace('<msgType>Alert', '<msgType>Cancel')], getafe, now).length,
    0,
  );
  assert.equal(warningsFor([red.replaceAll('<value>rojo', '<value>verde')], getafe, now).length, 0);
});

test('an update replaces the warning it updates', () => {
  const red = CAP_FILES.find((f) => f.name.includes('NERO')).content;
  const update = red
    .replace('<msgType>Alert', '<msgType>Update')
    .replace(/<identifier>[^<]+/, '<identifier>2.49.0.0.724.0.ES.20210109060000.722802NERO0902')
    .replace('<sent>2021-01-08T19:30:00+01:00', '<sent>2021-01-09T07:00:00+01:00')
    .replace('<headline>Aviso rojo', '<headline>Actualización. Aviso rojo');
  const warnings = warningsFor([red, update], getafe, at('2021-01-09T12:30:00Z'));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].headline, /^Actualización/);
});

test('the phenomenon is read from its code, or from its Spanish name', () => {
  assert.equal(phenomenonOf('VI;Vientos'), 'wind');
  assert.equal(phenomenonOf('AT;Temperaturas máximas'), 'heat');
  assert.equal(phenomenonOf('XX;Temperaturas mínimas'), 'cold');
  assert.equal(phenomenonOf('ZZ;Nieblas'), 'fog');
  assert.equal(phenomenonOf('', 'Aviso de polvo en suspensión'), 'dust');
  assert.equal(phenomenonOf('QQ;Algo nuevo'), 'other');
});

test('XML entities and CDATA are decoded', () => {
  const red = CAP_FILES.find((f) => f.name.includes('NERO')).content;
  const [warning] = parseCap(
    red.replace(
      '<headline>Aviso rojo por nevadas.',
      '<headline><![CDATA[Aviso rojo]]> &amp; nevadas &#233;&#x00e9;.',
    ),
  );
  assert.match(warning.headline, /^Aviso rojo & nevadas éé\./);
});

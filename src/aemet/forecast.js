// -----------------------------------------------------------------------------
// Reading the AEMET forecasts and observations (the JSON of the `datos` URL).
//
// Hourly forecast of a town: `[ { nombre, provincia, elaborado, prediccion:
// { dia: [ { fecha, estadoCielo: [{ value, periodo: "07", descripcion }],
// temperatura, sensTermica, humedadRelativa, precipitacion, probPrecipitacion
// (6-hour windows "0107", "0713", "1319", "1901"), vientoAndRachaMax (a wind
// entry { direccion: ["NE"], velocidad: ["28"] } then a gust entry { value }
// for each hour), ... } ] } } ]`. Values are strings, "" when unknown, "Ip"
// (inapreciable) for a trace of rain.
//
// Daily forecast: the same envelope, one entry per day with min/max, `uvMax`
// and values per period ("00-24", "00-12", "12-24", "00-06"...; the far days
// only carry the long periods).
//
// Observations: one record per station and hour, `fint` in UTC without an
// offset, wind speeds `vv`/`vmax` in m/s (converted to km/h here, the unit of
// the forecasts).
// -----------------------------------------------------------------------------

import { distanceKm, localParts } from './geo.js';

// Past this age, an observation is not "the current weather" any more.
export const OBSERVATION_MAX_AGE_MS = 3 * 60 * 60 * 1000;
// AEMET's own radius for "the nearest station / town".
export const MAX_DISTANCE_KM = 40;

const WIND_DEGREES = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };

/** A number from an AEMET value ("12", "-0", "Ip", "", 7.5), or null. */
export function num(value) {
  if (value === 'Ip') {
    return 0;
  }
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const number = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return number === 0 ? 0 : number; // "-0" is 0
}

/** `{ code: '36', night: true }` from "36n", or null. */
export function skyCode(value) {
  const match = String(value ?? '').match(/^(\d{2})(n?)$/);
  return match ? { code: match[1], night: match[2] === 'n' } : null;
}

const prediction = (data) => (Array.isArray(data) ? data[0] : data)?.prediccion?.dia ?? [];
const dayOf = (fecha) => String(fecha ?? '').slice(0, 10);
const hh = (hour) => String(hour).padStart(2, '0');

/** Does a 6-hour window "1319" contain this hour? ("1901" runs to 01:00.) */
function windowHas(period, hour) {
  const start = Number(String(period).slice(0, 2));
  const end = Number(String(period).slice(2, 4));
  return start < end ? hour >= start && hour < end : hour >= start;
}

/**
 * The forecast for the current hour of the town.
 * @param {any} hourly the data of the hourly forecast
 * @param {Date} now
 * @param {string} timeZone the town's
 * @returns {object|null} null when the forecast does not cover this hour
 */
export function currentHour(hourly, now, timeZone) {
  const days = prediction(hourly);
  const local = localParts(now, timeZone);
  const index = days.findIndex((day) => dayOf(day.fecha) === local.date);
  const day = days[index];
  const period = hh(local.hour);
  const at = (list) =>
    Array.isArray(list) ? list.find((entry) => entry.periodo === period) : null;
  const temperature = num(at(day?.temperatura)?.value);
  if (!day || temperature === null) {
    return null;
  }
  const windEntries = (day.vientoAndRachaMax ?? []).filter((entry) => entry.periodo === period);
  const wind = windEntries.find((entry) => entry.direccion !== undefined);
  const gust = windEntries.find((entry) => entry.value !== undefined);
  const direction = Array.isArray(wind?.direccion) ? wind.direccion[0] : wind?.direccion;

  // Before 01:00 the 6-hour window is the "1901" one of the day before.
  const windowDay = local.hour < 1 ? days[index - 1] : day;
  const rainWindow = (windowDay?.probPrecipitacion ?? []).find((entry) =>
    local.hour < 1 ? entry.periodo === '1901' : windowHas(entry.periodo, local.hour),
  );
  const sky = at(day.estadoCielo);
  return {
    temperature,
    feelsLike: num(at(day.sensTermica)?.value),
    humidity: num(at(day.humedadRelativa)?.value),
    precipitation: num(at(day.precipitacion)?.value),
    rainProbability: num(rainWindow?.value),
    windSpeed: num(wind?.velocidad),
    windDirection: WIND_DEGREES[direction] ?? null,
    windGust: num(gust?.value),
    sky: skyCode(sky?.value),
    skyText: sky?.descripcion || null,
  };
}

// The period read first for a whole day: the day itself, then its halves.
const DAY_PERIODS = ['00-24', '12-24', '00-12', '06-12', '12-18', '18-24', '00-06'];

function dayValue(list, key = 'value') {
  if (!Array.isArray(list)) {
    return null;
  }
  for (const period of DAY_PERIODS) {
    const entry = list.find((item) => item.periodo === period);
    if (entry && entry[key] !== '' && entry[key] !== undefined && entry[key] !== null) {
      return entry;
    }
  }
  return null;
}

function maxValue(list) {
  const values = (Array.isArray(list) ? list : [])
    .map((entry) => num(entry?.value))
    .filter((v) => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

/**
 * The days of the daily forecast, from today (town time) on.
 * @returns {Array<{ date: string, min: number|null, max: number|null,
 *   rainProbability: number|null, sky: object|null, uv: number|null }>}
 */
export function forecastDays(daily, now, timeZone) {
  const today = localParts(now, timeZone).date;
  return prediction(daily)
    .filter((day) => dayOf(day.fecha) >= today)
    .map((day) => ({
      date: dayOf(day.fecha),
      min: num(day.temperatura?.minima),
      max: num(day.temperatura?.maxima),
      // The highest chance over the periods: today's "00-24" may still say 0
      // while its afternoon says 100.
      rainProbability: maxValue(day.probPrecipitacion),
      sky: skyCode(dayValue(day.estadoCielo)?.value),
      uv: num(day.uvMax),
    }));
}

/** When the town forecast was produced (`elaborado`, town time), for the logs. */
export function producedAt(data) {
  const entry = Array.isArray(data) ? data[0] : data;
  return typeof entry?.elaborado === 'string' ? entry.elaborado : null;
}

const ms = (fint) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(fint) ? fint : `${fint}Z`);
const kmh = (metersPerSecond) =>
  metersPerSecond === null ? null : Math.round(metersPerSecond * 36) / 10;

/**
 * The latest observation of a station, if recent enough.
 * @param {any[]} samples the data of `observacion/convencional/datos/estacion/<id>`
 * @returns {object|null}
 */
export function latestObservation(samples, now) {
  const list = (Array.isArray(samples) ? samples : []).filter((s) => Number.isFinite(ms(s?.fint)));
  if (list.length === 0) {
    return null;
  }
  const last = list.reduce((a, b) => (ms(b.fint) > ms(a.fint) ? b : a));
  const at = ms(last.fint);
  if (now.getTime() - at > OBSERVATION_MAX_AGE_MS) {
    return null;
  }
  return {
    at: new Date(at).toISOString(),
    station: last.idema,
    temperature: num(last.ta),
    humidity: num(last.hr),
    // Sea-level pressure when the station computes it: comparable between places.
    pressure: num(last.pres_nmar) ?? num(last.pres),
    precipitation: num(last.prec),
    windSpeed: kmh(num(last.vv)),
    windGust: kmh(num(last.vmax)),
  };
}

/**
 * The nearest station of a point, among the records of `observacion/convencional/todas`.
 * @returns {{ id: string, name: string, distance: number }|null} null past 40 km
 */
export function nearestStation(records, lat, lon) {
  let best = null;
  for (const record of Array.isArray(records) ? records : []) {
    const sLat = num(record?.lat);
    const sLon = num(record?.lon);
    if (typeof record?.idema !== 'string' || sLat === null || sLon === null) {
      continue;
    }
    const distance = distanceKm(lat, lon, sLat, sLon);
    if (distance <= MAX_DISTANCE_KM && (!best || distance < best.distance)) {
      best = { id: record.idema, name: String(record.ubi ?? record.idema).trim(), distance };
    }
  }
  return best && { ...best, distance: Math.round(best.distance * 10) / 10 };
}

/** The town master data we keep: `{ code, name, lat, lon, zone }`. */
export function townInfo(record, code) {
  return {
    code,
    name: String(record?.nombre ?? code).trim(),
    lat: num(record?.latitud_dec),
    lon: num(record?.longitud_dec),
    // The warning zone of Meteoalerta (6 digits: region, province, zone).
    zone: /^\d{6}$/.test(String(record?.zona_comarcal ?? '')) ? String(record.zona_comarcal) : null,
  };
}

/**
 * The nearest town of a point, among `maestro/municipios`.
 * @returns {{ code: string, name: string, distance: number }|null} null past 40 km
 */
export function nearestTown(records, lat, lon) {
  let best = null;
  for (const record of Array.isArray(records) ? records : []) {
    const code = String(record?.id ?? '').replace(/^id/, '');
    const tLat = num(record?.latitud_dec);
    const tLon = num(record?.longitud_dec);
    if (!/^\d{5}$/.test(code) || tLat === null || tLon === null) {
      continue;
    }
    const distance = distanceKm(lat, lon, tLat, tLon);
    if (distance <= MAX_DISTANCE_KM && (!best || distance < best.distance)) {
      best = { code, name: String(record.nombre ?? code).trim(), distance };
    }
  }
  return best && { ...best, distance: Math.round(best.distance * 10) / 10 };
}

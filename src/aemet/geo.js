// -----------------------------------------------------------------------------
// Places and clocks.
//
// The forecasts are written in the local time of the town, without offset:
// "2021-01-09T00:00:00", period "07" is 07:00 in Madrid — or in the Canary
// Islands, one hour behind. The container clock follows the Gladys time zone,
// which may be anywhere (a holiday home in Spain watched from Belgium): the
// town's own zone is used for every forecast time. The observations are in UTC.
// -----------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

// Provinces of Las Palmas (35) and Santa Cruz de Tenerife (38).
const CANARY_PROVINCES = new Set(['35', '38']);

/** IANA time zone of a town, from its INE code. */
export function townTimeZone(code) {
  return CANARY_PROVINCES.has(String(code).slice(0, 2)) ? 'Atlantic/Canary' : 'Europe/Madrid';
}

/** Great-circle distance, in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Is a point inside a CAP polygon ("lat,lon lat,lon ...", closed or not)?
 * Ray casting: enough for warning zones, a few dozen km wide.
 */
export function insidePolygon(lat, lon, polygon) {
  const points = String(polygon)
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  if (points.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [latI, lonI] = points[i];
    const [latJ, lonJ] = points[j];
    if (latI > lat !== latJ > lat && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) {
      inside = !inside;
    }
  }
  return inside;
}

const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      }),
    );
  }
  return formatters.get(timeZone);
}

/**
 * The wall clock of a zone at an instant.
 * @returns {{ date: string, hour: number, minute: number, second: number, weekday: number }}
 *   date `YYYY-MM-DD`, weekday 0 (Sunday) to 6
 */
export function localParts(instant, timeZone) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  };
}

/**
 * The instant of a wall-clock time in a zone (the hour may be 24: midnight of
 * the next day). Two passes settle the offset, DST changes included.
 * @param {string} date `YYYY-MM-DD`
 * @param {number} hour
 * @returns {Date}
 */
export function zonedTime(date, hour, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = localParts(new Date(guess), timeZone);
    const [y, m, d] = local.date.split('-').map(Number);
    const seen = Date.UTC(y, m - 1, d, local.hour, local.minute, local.second);
    guess += wanted - seen;
  }
  return new Date(guess);
}

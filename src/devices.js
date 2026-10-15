// -----------------------------------------------------------------------------
// One Gladys device per town: the forecast of the current hour, today's
// extremes, the Meteoalerta warnings and the observation of the nearest
// station. Read only: nothing to command.
//
// External ids are built from the INE code of the town (`town:<code>`), the
// stable id AEMET gives it; the feature keys are English and never change.
// The station features do not carry the station id: a closer station found
// later keeps the same features and their history.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, LEVEL_TEXT, PHENOMENON_NAMES, TEXT, pick, skyText } from './i18n.js';
import { isActive } from './aemet/warnings.js';

export const DEVICE_TYPE = 'town';

// key: feature key (external id suffix), name: FEATURE_NAMES key.
export const FEATURES = [
  {
    key: 'temperature',
    name: 'temperature',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -50,
    max: 60,
  },
  {
    key: 'feels-like',
    name: 'feelsLike',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -60,
    max: 60,
  },
  {
    key: 'humidity',
    name: 'humidity',
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  {
    key: 'wind-speed',
    name: 'windSpeed',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 250,
  },
  {
    key: 'wind-gust',
    name: 'windGust',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
  },
  {
    key: 'wind-direction',
    name: 'windDirection',
    category: C.ANGLE_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.DEGREE,
    min: 0,
    max: 360,
  },
  {
    key: 'rain-probability',
    name: 'rainProbability',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  {
    key: 'precipitation',
    name: 'precipitation',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_HOUR,
    min: 0,
    max: 200,
  },
  { key: 'sky', name: 'sky', category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, text: true },
  {
    key: 'uv-index',
    name: 'uv',
    category: C.UV_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.UV_INDEX,
    min: 0,
    max: 15,
  },
  {
    key: 'today-min',
    name: 'todayMin',
    category: C.TEMPERATURE_SENSOR,
    type: T.TEMPERATURE_SENSOR.MIN,
    unit: U.CELSIUS,
    min: -50,
    max: 60,
  },
  {
    key: 'today-max',
    name: 'todayMax',
    category: C.TEMPERATURE_SENSOR,
    type: T.TEMPERATURE_SENSOR.MAX,
    unit: U.CELSIUS,
    min: -50,
    max: 60,
  },
  {
    key: 'warning-level',
    name: 'warningLevel',
    category: C.RISK,
    type: T.RISK.INTEGER,
    min: 0,
    max: 3,
  },
  {
    key: 'warning-upcoming',
    name: 'warningUpcoming',
    category: C.RISK,
    type: T.RISK.INTEGER,
    min: 0,
    max: 3,
  },
  {
    key: 'warnings',
    name: 'warningText',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    min: 0,
    max: 0,
    text: true,
  },
  {
    key: 'station-temperature',
    name: 'obsTemperature',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -50,
    max: 60,
  },
  {
    key: 'station-humidity',
    name: 'obsHumidity',
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  {
    key: 'station-pressure',
    name: 'obsPressure',
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 850,
    max: 1100,
  },
  {
    key: 'station-precipitation',
    name: 'obsPrecipitation',
    category: C.PRECIPITATION_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_HOUR,
    min: 0,
    max: 200,
  },
  {
    key: 'station-wind',
    name: 'obsWind',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 250,
  },
];

export const townIds = (gladys, code) => gladys.externalIds(DEVICE_TYPE, code);

/** The INE code of one of our device external ids, or null. */
export function codeOfDevice(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  const rest = String(externalId ?? '').startsWith(prefix) ? externalId.slice(prefix.length) : '';
  const match = rest.match(/^(\d{5})(?::|$)/);
  return match ? match[1] : null;
}

/**
 * The Gladys device of a town.
 * @param {object} gladys
 * @param {{ code: string, name: string }} town
 * @param {{ id: string, name: string, distance: number }|null} station
 * @param {string} language
 */
export function buildDevice(gladys, town, station, language) {
  const ids = townIds(gladys, town.code);
  const names = FEATURE_NAMES[language] ?? FEATURE_NAMES.en;
  const params = [{ name: 'INE_CODE', value: town.code }];
  if (station) {
    params.push({
      name: 'AEMET_STATION',
      value: `${station.name} (${station.id}, ${station.distance} km)`,
    });
  }
  return {
    name: `AEMET ${town.name}`,
    external_id: ids.device,
    model: 'AEMET OpenData',
    // Polled by the container's own timer (src/hub.js); the core's onPoll
    // is a fallback, cheap when nothing is due.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params,
    features: FEATURES.map((feature) => ({
      name: names[feature.name],
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: !feature.text,
    })),
  };
}

const round1 = (value) => Math.round(value * 10) / 10;

/** "Orange: wind; yellow: rain (from Tue 14:00)" — never empty. */
export function warningsText(warnings, now, language, timeZone) {
  if (warnings.length === 0) {
    return pick(TEXT.noWarning, language);
  }
  const levels = LEVEL_TEXT[language] ?? LEVEL_TEXT.en;
  const phenomena = PHENOMENON_NAMES[language] ?? PHENOMENON_NAMES.en;
  const parts = warnings.slice(0, 4).map((warning) => {
    const label = `${levels[warning.level]}: ${phenomena[warning.phenomenon]}`;
    if (isActive(warning, now)) {
      return label;
    }
    return `${label} (${pick(TEXT.from, language)} ${shortTime(warning.onset, language, timeZone)})`;
  });
  return parts.join('; ').slice(0, 250);
}

/** "Tue 14:00" in the town's time. */
export function shortTime(iso, language, timeZone) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return '?';
  }
  const locale = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * The states of a town device from what is known of it.
 * @param {object} gladys
 * @param {object} snapshot `{ town, timeZone, hour, today, warnings, warningsKnown, observation }`
 * @param {Date} now
 * @param {string} language
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function statesOf(gladys, snapshot, now, language) {
  const ids = townIds(gladys, snapshot.town.code);
  const states = [];
  const number = (key, value, digits = 1) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({
        device_feature_external_id: ids.feature(key),
        state: digits === 0 ? Math.round(value) : round1(value),
      });
    }
  };
  const text = (key, value) => {
    // An empty text is ignored by Gladys: never sent.
    if (typeof value === 'string' && value.trim() !== '') {
      states.push({ device_feature_external_id: ids.feature(key), text: value.trim() });
    }
  };

  const { hour, today, observation } = snapshot;
  if (hour) {
    number('temperature', hour.temperature);
    number('feels-like', hour.feelsLike);
    number('humidity', hour.humidity, 0);
    number('wind-speed', hour.windSpeed, 0);
    number('wind-gust', hour.windGust, 0);
    number('wind-direction', hour.windDirection, 0);
    number('rain-probability', hour.rainProbability, 0);
    number('precipitation', hour.precipitation);
    text('sky', skyText(hour.sky, language) ?? hour.skyText);
  }
  if (today) {
    number('uv-index', today.uv, 0);
    number('today-min', today.min);
    number('today-max', today.max);
  }
  if (snapshot.warningsKnown) {
    const warnings = snapshot.warnings;
    const active = warnings.filter((warning) => isActive(warning, now));
    number('warning-level', Math.max(0, ...active.map((w) => w.level)), 0);
    number('warning-upcoming', Math.max(0, ...warnings.map((w) => w.level)), 0);
    text('warnings', warningsText(warnings, now, language, snapshot.timeZone));
  }
  if (observation) {
    number('station-temperature', observation.temperature);
    number('station-humidity', observation.humidity, 0);
    number('station-pressure', observation.pressure);
    number('station-precipitation', observation.precipitation);
    number('station-wind', observation.windSpeed);
  }
  return states;
}

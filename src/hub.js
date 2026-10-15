// -----------------------------------------------------------------------------
// The hub: what is known of each configured town, when to read AEMET again,
// and what to send to Gladys.
//
// Refreshing. The core cannot be trusted to call onPoll (Gladys#3198: a
// device created without `should_poll` is never polled, and keeps the
// polling fields it was created with). So the container ticks by itself,
// every minute, and the core's onPoll runs the very same tick as a fallback.
// A tick is cheap: it only calls AEMET for what is due, the states are
// computed again from what is cached (the forecast of the current hour
// changes every hour without any new download), and only the values that
// changed are sent.
//
// The API quota (per key) sets the pace, for each town:
//   - hourly and daily forecasts: every 30 minutes (AEMET updates them a few
//     times a day);
//   - station observation: every 30 minutes (one record per hour);
//   - warnings: every 10 minutes, one download per region shared by the
//     towns of that region.
// Each read is two requests (the envelope, then the data): about 24 requests
// an hour per town. A failure waits 5 minutes (15 after a quota refusal).
// Only the towns whose device the user added to Gladys are read: the core
// drops the states of a device it does not know.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MAX_TOWNS } from './config.js';
import { AemetClient, AemetError, ERROR_KINDS } from './aemet/client.js';
import {
  currentHour,
  forecastDays,
  latestObservation,
  nearestStation,
  nearestTown,
  townInfo,
} from './aemet/forecast.js';
import { localParts, townTimeZone } from './aemet/geo.js';
import {
  extractDocuments,
  isActive,
  LEVEL_NAMES,
  regionOfZone,
  warningsFor,
} from './aemet/warnings.js';
import { buildDevice, codeOfDevice, shortTime, statesOf, townIds } from './devices.js';
import { LANGUAGES, LEVEL_TEXT, PHENOMENON_NAMES, TEXT, message, pick } from './i18n.js';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'aemet' });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TIMINGS = {
  tick: MINUTE,
  forecast: 30 * MINUTE,
  observation: 30 * MINUTE,
  warnings: 10 * MINUTE,
  retry: 5 * MINUTE,
  quotaRetry: 15 * MINUTE,
  // The master data and the nearest station barely change; the station list
  // is a download of several MB.
  townInfo: 30 * DAY,
  station: 30 * DAY,
  stationRetry: 6 * HOUR,
  townList: DAY,
  // Unchanged values are sent again this often: Gladys says "no recent
  // value" after 48 h, and the maintainer's rule is 12 h at most.
  heartbeat: 6 * HOUR,
};

export const WIDGET_KEY = 'forecast';
export const WARNING_TRIGGER = 'warning_issued';

export class AemetHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {boolean} [options.timers] run the internal timer (tests may turn it off)
   * @param {() => number} [options.now]
   * @param {Partial<typeof TIMINGS>} [options.timings]
   */
  constructor({ gladys, store, fetch, timers = true, now = () => Date.now(), timings = {} }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetch;
    this.timers = timers;
    this.now = now;
    this.timings = { ...TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    /** Persisted: `{ towns: { code: { info, at } }, stations: { code: { station, at } }, warnings: { code: { key: level } } }`. */
    this.saved = { towns: {}, stations: {}, warnings: {} };
    /** Per town: downloaded data and when to read each source again. */
    this.towns = new Map();
    /** Per region: the warning documents and when to read them again. */
    this.regions = new Map();
    this.townList = null;
    this.timer = null;
    this.ticking = null;
    this.status = null;
    this.stopped = false;
  }

  // --- Lifecycle ----------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      towns: saved.towns ?? {},
      stations: saved.stations ?? {},
      warnings: saved.warnings ?? {},
    };
    await this.reconfigure(config);
  }

  /** A new configuration, or the first one. */
  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (!previous || previous.apiKey !== config.apiKey) {
      this.client = config.apiKey
        ? new AemetClient({ apiKey: config.apiKey, fetch: this.fetch })
        : null;
      // Everything read with the previous key is read again, its failures forgotten.
      this.towns.clear();
      this.regions.clear();
      this.failing?.clear();
      this.backoff?.clear();
      this.lastErrorKind = null;
    }
    for (const code of this.towns.keys()) {
      if (!config.towns.includes(code)) {
        this.towns.delete(code);
      }
    }
    if (config.invalidTowns.length > 0) {
      logger.warn(`Ignored town codes: ${config.invalidTowns.join(', ')}`);
    }
    if (previous && previous.language !== config.language) {
      // Every text (sky, warnings) changes language: send them all again.
      for (const code of config.towns) {
        this.gladys.forgetPublishedStates(townIds(this.gladys, code).device);
      }
    }
    await this.publishDevices();
    this.schedule();
    await this.tick();
  }

  /** Gladys came back (restart, network): it may have lost what was sent. */
  async resync() {
    this.gladys.forgetPublishedStates();
    await this.publishDevices();
    await this.tick();
  }

  /** A device was just added: send its states now, not up to a minute later. */
  async onDeviceCreated(device) {
    const code = codeOfDevice(this.gladys, device.external_id);
    if (!code || !this.config?.towns.includes(code)) {
      return;
    }
    this.gladys.forgetPublishedStates(device.external_id);
    await this.tick();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    return this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timers || this.stopped) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.tick();
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        this.schedule();
      }
    }, this.timings.tick);
  }

  // --- Devices --------------------------------------------------------------------

  /** Publish one device per town whose master data is known (looked up when missing). */
  async publishDevices() {
    const devices = [];
    for (const code of this.config.towns) {
      const town = await this.townOf(code);
      if (town) {
        devices.push(
          buildDevice(this.gladys, town, await this.stationOf(town), this.config.language),
        );
      }
    }
    // Several MB: kept only while every town of this publication gets its station.
    this.stationList = null;
    await this.gladys.publishDiscoveredDevices(devices);
    await this.updateStatus();
  }

  /** The master data of a town: from /data, or from AEMET. Null when unknown yet. */
  async townOf(code) {
    const cached = this.saved.towns[code];
    if (cached && this.now() - cached.at < this.timings.townInfo) {
      return cached.info;
    }
    if (!this.client || this.isBackingOff(`town:${code}`)) {
      return cached?.info ?? null;
    }
    try {
      const info = townInfo(await this.client.town(code), code);
      this.saved.towns[code] = { info, at: this.now() };
      this.persist();
      this.succeeded(`town:${code}`);
      return info;
    } catch (err) {
      this.failed(`town:${code}`, `Town ${code}: cannot read its AEMET master data`, err);
      return cached?.info ?? null;
    }
  }

  /** The nearest station of a town: from /data, or looked up in the station list. */
  async stationOf(town) {
    const cached = this.saved.stations[town.code];
    const age = cached ? this.now() - cached.at : Infinity;
    if (cached && (age < this.timings.station || this.isBackingOff('stations'))) {
      return cached.station;
    }
    if (!this.client || town.lat === null || this.isBackingOff('stations')) {
      return cached?.station ?? null;
    }
    try {
      this.stationList ??= await this.client.stations();
      const station = nearestStation(this.stationList, town.lat, town.lon);
      this.saved.stations[town.code] = { station, at: this.now() };
      this.persist();
      this.succeeded('stations');
      logger.debug(
        `${town.name}: station ${station ? `${station.id} at ${station.distance} km` : 'none'}`,
      );
      return station;
    } catch (err) {
      this.failed('stations', 'Cannot read the AEMET station list', err, this.timings.stationRetry);
      return cached?.station ?? null;
    }
  }

  // --- Refreshing -------------------------------------------------------------------

  /** One cycle; a second caller (onPoll during the timer) waits for the same one. */
  tick() {
    if (!this.ticking) {
      this.ticking = this.runTick().finally(() => {
        this.ticking = null;
      });
    }
    return this.ticking;
  }

  async runTick() {
    if (!this.config || !this.client || this.gladys.connected === false) {
      return;
    }
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    const codes = this.config.towns.filter((code) =>
      created.has(townIds(this.gladys, code).device),
    );
    const unknown = this.config.towns.filter(
      (code) => !this.saved.towns[code] && !this.isBackingOff(`town:${code}`),
    );
    if (unknown.length > 0) {
      // A town whose master data could not be read yet: try again.
      await this.publishDevices();
    }
    for (const code of codes) {
      await this.refreshTown(code);
    }
    this.stationList = null;
    await this.updateStatus();
  }

  townState(code) {
    if (!this.towns.has(code)) {
      this.towns.set(code, { due: {}, hourly: null, daily: null, samples: null });
    }
    return this.towns.get(code);
  }

  async refreshTown(code) {
    const town = await this.townOf(code);
    if (!town) {
      return;
    }
    const state = this.townState(code);
    const now = this.now();
    if (!(now < (state.due.forecast ?? 0))) {
      await this.read(state, 'forecast', `forecast:${code}`, `${town.name}: forecast`, async () => {
        const [hourly, daily] = await Promise.all([
          this.client.hourlyForecast(code),
          this.client.dailyForecast(code),
        ]);
        state.hourly = hourly;
        state.daily = daily;
      });
    }
    const station = await this.stationOf(town);
    if (station && !(now < (state.due.observation ?? 0))) {
      await this.read(
        state,
        'observation',
        `station:${code}`,
        `${town.name}: station ${station.id}`,
        async () => {
          state.samples = await this.client.station(station.id);
        },
      );
    }
    const region = regionOfZone(town.zone);
    if (region) {
      await this.refreshRegion(region);
    }
    await this.publishTown(town);
  }

  /** Read one source, then set when to read it again. */
  async read(state, source, issueKey, label, run) {
    try {
      await run();
      state.due[source] = this.now() + this.timings[source];
      this.succeeded(issueKey, `${label}: read again`);
    } catch (err) {
      state.due[source] = this.now() + this.retryDelay(err);
      this.failed(issueKey, `${label}: reading failed`, err);
    }
  }

  async refreshRegion(region) {
    const entry = this.regions.get(region) ?? { due: 0, documents: null };
    this.regions.set(region, entry);
    if (this.now() < entry.due) {
      return;
    }
    try {
      entry.documents = extractDocuments(await this.client.warnings(region));
      entry.due = this.now() + this.timings.warnings;
      this.succeeded(`warnings:${region}`, `Warnings of region ${region}: read again`);
    } catch (err) {
      if (err instanceof AemetError && err.kind === ERROR_KINDS.NO_DATA) {
        // No warning file for the region: no warning at all.
        entry.documents = [];
        entry.due = this.now() + this.timings.warnings;
        this.succeeded(`warnings:${region}`, `Warnings of region ${region}: read again`);
        return;
      }
      entry.due = this.now() + this.retryDelay(err);
      this.failed(`warnings:${region}`, `Warnings of region ${region}: reading failed`, err);
    }
  }

  retryDelay(err) {
    return err?.kind === ERROR_KINDS.QUOTA ? this.timings.quotaRetry : this.timings.retry;
  }

  // --- What Gladys receives ---------------------------------------------------------

  /** What is known of a town right now, for its states and the widget. */
  snapshot(code) {
    const town = this.saved.towns[code]?.info;
    if (!town) {
      return null;
    }
    const state = this.towns.get(code);
    const now = new Date(this.now());
    const timeZone = townTimeZone(code);
    const region = regionOfZone(town.zone);
    const documents = region ? this.regions.get(region)?.documents : null;
    const days = state?.daily ? forecastDays(state.daily, now, timeZone) : [];
    const today = localParts(now, timeZone).date;
    return {
      town,
      timeZone,
      station: this.saved.stations[code]?.station ?? null,
      hour: state?.hourly ? currentHour(state.hourly, now, timeZone) : null,
      today: days.find((day) => day.date === today) ?? null,
      days,
      warningsKnown: Array.isArray(documents),
      warnings: Array.isArray(documents) ? warningsFor(documents, town, now) : [],
      observation: state?.samples ? latestObservation(state.samples, now) : null,
    };
  }

  async publishTown(town) {
    const snapshot = this.snapshot(town.code);
    const now = new Date(this.now());
    if (snapshot.warningsKnown) {
      await this.announceWarnings(snapshot, now);
    }
    const states = statesOf(this.gladys, snapshot, now, this.config.language);
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeat,
      });
      this.succeeded('publish', 'Gladys accepts the states again');
      if (count > 0) {
        logger.debug(`${town.name}: ${count} state(s) sent`);
        this.gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    } catch (err) {
      this.failed('publish', 'Gladys refused the states', err);
    }
  }

  /**
   * Fire the "new warning" trigger for each warning not announced yet for
   * this town, or announced at a lower level. The first reading of a town
   * only takes the warnings in force as known: installing the integration,
   * or adding a town, does not announce what was already there.
   */
  async announceWarnings(snapshot, now) {
    const { town } = snapshot;
    const known = this.saved.warnings[town.code];
    const next = {};
    const fresh = [];
    for (const warning of snapshot.warnings) {
      // Keyed on the day it starts: an update that moves the start by a few
      // hours is the same warning, not a new one.
      const key = `${warning.zone ?? warning.area}|${warning.phenomenon}|${String(warning.onset).slice(0, 10)}`;
      const seen = Math.max(known?.[key] ?? 0, next[key] ?? 0);
      if (known && warning.level > seen) {
        fresh.push(warning);
      }
      next[key] = Math.max(next[key] ?? 0, warning.level);
    }
    const changed = !known || JSON.stringify(known) !== JSON.stringify(next);
    this.saved.warnings[town.code] = next;
    if (changed) {
      this.persist();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    const deviceId = townIds(this.gladys, town.code).device;
    for (const warning of fresh) {
      const data = warningEvent(
        warning,
        deviceId,
        town,
        snapshot.timeZone,
        this.config.language,
        now,
      );
      try {
        await this.gladys.publishSceneEvent(WARNING_TRIGGER, data);
        logger.info(`${town.name}: new AEMET warning (${data.level}, ${warning.phenomenon})`);
      } catch (err) {
        logger.warn(`${town.name}: the new warning could not be announced (${err.message})`);
      }
    }
  }

  // --- Configuration screen ---------------------------------------------------------

  async updateStatus() {
    let connected = true;
    let text = null;
    if (!this.config.apiKey) {
      [connected, text] = [false, TEXT.missingKey];
    } else if (this.config.towns.length === 0) {
      [connected, text] = [false, TEXT.missingTowns];
    } else if (this.lastErrorKind === ERROR_KINDS.AUTH) {
      [connected, text] = [false, TEXT.keyRefused];
    } else if (this.lastErrorKind === ERROR_KINDS.QUOTA) {
      [connected, text] = [false, TEXT.quota];
    } else if (this.lastErrorKind === ERROR_KINDS.NETWORK) {
      [connected, text] = [false, TEXT.unreachable];
    }
    const status = `${connected}:${text?.en ?? ''}`;
    if (status === this.status) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, text ?? undefined);
      this.status = status;
      if (connected) {
        logger.info(`Connected to AEMET OpenData (${this.config.towns.length} town(s))`);
      }
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  succeeded(key, recoveryMessage) {
    this.issues.ok(key, recoveryMessage ?? `${key}: works again`);
    this.failing?.delete(key);
    if (!this.failing?.size) {
      this.lastErrorKind = null;
    }
    this.backoff?.delete(key);
  }

  failed(key, label, err, retry) {
    // Only an AEMET failure says something about AEMET on the Configuration
    // screen; a refusal of Gladys itself (states) is only logged.
    const kind = err instanceof AemetError ? err.kind : null;
    this.issues.fail(key, `${label} (${err.message})`);
    this.failing ??= new Set();
    this.backoff ??= new Map();
    if (kind && kind !== ERROR_KINDS.NO_DATA && kind !== ERROR_KINDS.FORMAT) {
      this.failing.add(key);
      this.lastErrorKind = kind;
    }
    this.backoff.set(key, this.now() + (retry ?? this.retryDelay(err)));
  }

  isBackingOff(key) {
    return (this.backoff?.get(key) ?? 0) > this.now();
  }

  persist() {
    this.store.save(this.saved);
  }

  // --- Actions ----------------------------------------------------------------------

  /** "Test the connection": read the master data of every town. */
  async testConnection() {
    if (!this.config.apiKey) {
      return TEXT.missingKey;
    }
    if (this.config.towns.length === 0) {
      return TEXT.missingTowns;
    }
    const client = new AemetClient({ apiKey: this.config.apiKey, fetch: this.fetch });
    const found = [];
    const failures = [];
    for (const code of this.config.towns) {
      try {
        const info = townInfo(await client.town(code), code);
        this.saved.towns[code] = { info, at: this.now() };
        found.push(info);
      } catch (err) {
        if (err instanceof AemetError && err.kind === ERROR_KINDS.AUTH) {
          this.lastErrorKind = ERROR_KINDS.AUTH;
          await this.updateStatus();
          return TEXT.keyRefused;
        }
        failures.push({ code, err });
      }
    }
    this.persist();
    logger.info(`Connection test: ${found.length} town(s) found, ${failures.length} failure(s)`);
    if (found.length > 0) {
      this.lastErrorKind = null;
      this.failing?.clear();
      await this.publishDevices();
    }
    return Object.fromEntries(
      LANGUAGES.map((lang) => {
        const lines = [];
        if (found.length > 0) {
          lines.push(message('testOk', found.map((t) => `${t.name} (${t.code})`).join(', '))[lang]);
        }
        for (const town of found) {
          const station = this.saved.stations[town.code]?.station;
          lines.push(
            station
              ? message('stationFor', town.name, station.name, station.distance)[lang]
              : message('noStationFor', town.name)[lang],
          );
        }
        for (const { code, err } of failures) {
          lines.push(message('testTownFailed', code, err.message)[lang]);
        }
        if (this.config.invalidTowns.length > 0) {
          lines.push(message('invalidTowns', this.config.invalidTowns.join(', '))[lang]);
        }
        return [lang, lines.join('\n')];
      }),
    );
  }

  /**
   * "Find the nearest town" of a Gladys house, and add it to the configuration.
   * @param {string} houseSelector
   * @returns {Promise<{ text: object, towns?: string }>} the message, and the new town list to save
   */
  async findTown(houseSelector) {
    if (!this.config.apiKey) {
      return { text: TEXT.missingKey };
    }
    const houses = await this.gladys.getHouses();
    const house = houses.find((h) => h.selector === houseSelector);
    if (!house || house.latitude === null || house.longitude === null) {
      return { text: TEXT.houseWithoutLocation };
    }
    if (!this.townList || this.now() - this.townList.at > this.timings.townList) {
      const client = new AemetClient({ apiKey: this.config.apiKey, fetch: this.fetch });
      this.townList = { at: this.now(), records: await client.towns() };
    }
    const town = nearestTown(this.townList.records, house.latitude, house.longitude);
    if (!town) {
      return { text: TEXT.noTownNearby };
    }
    logger.info(`Nearest town of house "${house.name}": ${town.code} (${town.distance} km)`);
    if (this.config.towns.includes(town.code)) {
      return { text: message('townKnown', town.name, town.code, town.distance) };
    }
    if (this.config.towns.length >= MAX_TOWNS) {
      return { text: TEXT.tooManyTowns };
    }
    return {
      text: message('townAdded', town.name, town.code, town.distance),
      towns: [...this.config.towns, town.code].join(', '),
    };
  }
}

/** The data of a "new warning" scene event (flat, scalars only). */
export function warningEvent(warning, deviceId, town, timeZone, language, now) {
  const levelName = LEVEL_NAMES[warning.level];
  const phenomenon = pick(PHENOMENON_NAMES, language)[warning.phenomenon];
  const level = pick(LEVEL_TEXT, language)[warning.level];
  const period = `${pick(TEXT.from, language)} ${shortTime(warning.onset, language, timeZone)} ${pick(TEXT.until, language)} ${shortTime(warning.expires, language, timeZone)}`;
  return {
    device: deviceId,
    town: town.name,
    level: levelName,
    phenomenon: warning.phenomenon,
    summary: `${town.name} — ${level}: ${phenomenon}, ${period}`.slice(0, 1000),
    headline: (warning.headline ?? '').slice(0, 1000),
    onset: warning.onset,
    expires: warning.expires,
    in_force: isActive(warning, now),
  };
}

// -----------------------------------------------------------------------------
// Meteoalerta warnings, from the CAP files of AEMET.
//
// `avisos_cap/ultimoelaborado/area/<region>` serves the warnings of the last
// issue for a region as a tar archive (sometimes gzipped) of CAP 1.2 XML
// files, one per zone and phenomenon. Each file carries an <info> block per
// language (es-ES, en-GB) with the level in the parameter
// "AEMET-Meteoalerta nivel" (verde, amarillo, naranja, rojo), the phenomenon
// in the event code "AEMET-Meteoalerta fenomeno" ("VI;Vientos"), the period
// (onset, expires) and the area: its polygon and its zone code in the
// geocode "AEMET-Meteoalerta zona" (6 digits).
//
// The zone code is the `zona_comarcal` of the town master data, and its two
// first digits are the region asked for: a town is matched on its zone, and
// on the polygon when a file carries no zone code. No XML or tar library: the
// CAP format is small, regular and well-formed, the archive a plain ustar.
// -----------------------------------------------------------------------------

import { gunzipSync } from 'node:zlib';
import { insidePolygon } from './geo.js';

export const LEVELS = { none: 0, yellow: 1, orange: 2, red: 3 };
const LEVEL_OF_COLOR = { verde: 0, amarillo: 1, naranja: 2, rojo: 3 };
export const LEVEL_NAMES = ['none', 'yellow', 'orange', 'red'];

// The phenomena of the Meteoalerta plan. The codes are the ones of the CAP
// annex; the Spanish names catch a code this table would not know.
export const PHENOMENA = [
  'rain',
  'snow',
  'wind',
  'thunderstorm',
  'heat',
  'cold',
  'coastal',
  'fog',
  'dust',
  'avalanche',
  'rissaga',
  'thaw',
  'other',
];
const PHENOMENON_CODES = {
  PR: 'rain',
  NE: 'snow',
  VI: 'wind',
  TO: 'thunderstorm',
  AT: 'heat',
  BT: 'cold',
  CO: 'coastal',
};
const PHENOMENON_WORDS = [
  [/maxim|calor/, 'heat'],
  [/minim|frio/, 'cold'],
  [/torment/, 'thunderstorm'],
  [/lluvi|precipit/, 'rain'],
  [/nieve|nevad/, 'snow'],
  [/vient/, 'wind'],
  [/coster|ola|marit/, 'coastal'],
  [/niebl/, 'fog'],
  [/polvo|calima/, 'dust'],
  [/alud/, 'avalanche'],
  [/rissag/, 'rissaga'],
  [/deshiel/, 'thaw'],
];

// --- Archive -------------------------------------------------------------------

/**
 * The XML documents of a warnings download: a tar archive, gzipped or not,
 * or a single XML document.
 * @param {Buffer} bytes
 * @returns {string[]}
 */
export function extractDocuments(bytes) {
  let buffer = Buffer.from(bytes);
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    buffer = gunzipSync(buffer);
  }
  const head = buffer.subarray(0, 64).toString('utf8').trimStart();
  if (head.startsWith('<')) {
    return [buffer.toString('utf8')];
  }
  const documents = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const size = parseInt(
      header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim() || '0',
      8,
    );
    const type = String.fromCharCode(header[156] || 0x30);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const start = offset + 512;
    if ((type === '0' || type === '\0') && /\.xml$/i.test(name) && Number.isFinite(size)) {
      documents.push(buffer.subarray(start, start + size).toString('utf8'));
    }
    offset = start + Math.ceil((Number.isFinite(size) ? size : 0) / 512) * 512;
  }
  return documents;
}

// --- CAP -----------------------------------------------------------------------

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function unescapeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity] ?? match;
    })
    .trim();
}

/** The inner XML of every <name> element (any namespace prefix). */
function elements(xml, name) {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,
    'g',
  );
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function text(xml, name) {
  const [first] = elements(xml, name);
  return first === undefined ? null : unescapeXml(first);
}

/** `{ valueName: value }` of the <parameter>, <eventCode> or <geocode> pairs. */
function pairs(xml, name) {
  const result = {};
  for (const pair of elements(xml, name)) {
    const key = text(pair, 'valueName');
    if (key && !(key in result)) {
      result[key] = text(pair, 'value') ?? '';
    }
  }
  return result;
}

const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** The phenomenon key of "VI;Vientos" (code first, the name otherwise). */
export function phenomenonOf(value, event) {
  const [code, name] = String(value ?? '').split(';');
  if (PHENOMENON_CODES[code?.trim().toUpperCase()]) {
    return PHENOMENON_CODES[code.trim().toUpperCase()];
  }
  const words = fold(`${name ?? ''} ${event ?? ''}`);
  return PHENOMENON_WORDS.find(([pattern]) => pattern.test(words))?.[1] ?? 'other';
}

const iso = (value) => {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

/**
 * The warnings of one CAP document (one per area of its Spanish <info>).
 * @returns {object[]}
 */
export function parseCap(xml) {
  const msgType = text(xml, 'msgType');
  const identifier = text(xml, 'identifier');
  const sent = iso(text(xml, 'sent'));
  const infos = elements(xml, 'info');
  // The Spanish block is the reference; the others say the same.
  const info = infos.find((block) => /^es/i.test(text(block, 'language') ?? '')) ?? infos[0];
  if (!info || !identifier) {
    return [];
  }
  const parameters = pairs(info, 'parameter');
  const codes = pairs(info, 'eventCode');
  const level = LEVEL_OF_COLOR[fold(parameters['AEMET-Meteoalerta nivel'])] ?? 0;
  const event = text(info, 'event');
  const phenomenonValue = codes['AEMET-Meteoalerta fenomeno'] ?? '';
  const base = {
    identifier,
    msgType,
    sent,
    level,
    phenomenon: phenomenonOf(phenomenonValue, event),
    phenomenonCode: phenomenonValue.split(';')[0].trim() || null,
    phenomenonName: phenomenonValue.split(';')[1]?.trim() || event || null,
    onset: iso(text(info, 'onset') ?? text(info, 'effective')),
    expires: iso(text(info, 'expires')),
    headline: text(info, 'headline'),
    description: text(info, 'description'),
    probability: parameters['AEMET-Meteoalerta probabilidad'] ?? null,
  };
  return elements(info, 'area').map((area) => ({
    ...base,
    area: text(area, 'areaDesc'),
    zone: pairs(area, 'geocode')['AEMET-Meteoalerta zona'] ?? null,
    polygons: elements(area, 'polygon').map(unescapeXml),
  }));
}

/**
 * The warnings of a download that concern a town and are not over, the most
 * severe first, then the soonest. One warning per zone, phenomenon and start.
 * @param {string[]} documents
 * @param {{ zone: string|null, lat: number|null, lon: number|null }} town
 * @param {Date} now
 */
export function warningsFor(documents, town, now) {
  const kept = new Map();
  for (const document of documents) {
    for (const warning of parseCap(document)) {
      // Both zone codes known: they decide. Otherwise, the polygon does.
      const concerned =
        town.zone && warning.zone
          ? warning.zone === town.zone
          : town.lat !== null &&
            town.lon !== null &&
            warning.polygons.some((polygon) => insidePolygon(town.lat, town.lon, polygon));
      const over = warning.expires && Date.parse(warning.expires) <= now.getTime();
      if (!concerned || over || warning.level === 0 || warning.msgType === 'Cancel') {
        continue;
      }
      const key = `${warning.zone ?? warning.area}|${warning.phenomenon}|${warning.onset}`;
      const previous = kept.get(key);
      if (!previous || (warning.sent ?? '') > (previous.sent ?? '')) {
        const { polygons, ...rest } = warning; // eslint-disable-line no-unused-vars
        kept.set(key, { ...rest, key });
      }
    }
  }
  return [...kept.values()].sort(
    (a, b) => b.level - a.level || String(a.onset).localeCompare(String(b.onset)),
  );
}

/** Is a warning in force at this instant (started, not over)? */
export function isActive(warning, now) {
  const start = Date.parse(warning.onset ?? '');
  const end = Date.parse(warning.expires ?? '');
  return (
    (!Number.isFinite(start) || start <= now.getTime()) &&
    (!Number.isFinite(end) || now.getTime() < end)
  );
}

/** The Meteoalerta region of a warning zone ("722802" → "72"). */
export function regionOfZone(zone) {
  return /^\d{6}$/.test(String(zone ?? '')) ? String(zone).slice(0, 2) : null;
}

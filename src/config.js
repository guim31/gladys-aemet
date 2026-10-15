// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  api_key: '',
  towns: '',
  language: 'fr',
};

// One device per town: a holiday home and the main one, a few relatives. The
// API quota is per key, a dozen towns would eat it.
export const MAX_TOWNS = 5;

/**
 * Parse the town list: INE municipality codes (5 digits: 2 for the province,
 * 3 for the town), separated by commas, semicolons, spaces or new lines. The
 * AEMET form (`id28079`) and the URL of a town page on aemet.es
 * (`.../madrid-id28079`) are accepted too: users paste what they find.
 * @param {unknown} raw
 * @returns {{ towns: string[], invalid: string[] }}
 */
export function parseTowns(raw) {
  const towns = [];
  const invalid = [];
  const entries = typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  for (const entry of entries) {
    const text = entry.trim();
    if (!text) {
      continue;
    }
    const match = text.match(/(?:^|id|-)(\d{5})\/?$/i);
    const province = match ? Number(match[1].slice(0, 2)) : 0;
    // Provinces 01 to 52: 51 is Ceuta, 52 Melilla.
    if (!match || province < 1 || province > 52) {
      invalid.push(text);
    } else if (!towns.includes(match[1]) && towns.length < MAX_TOWNS) {
      towns.push(match[1]);
    }
  }
  return { towns, invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { towns, invalid } = parseTowns(
    typeof source.towns === 'string' ? source.towns : DEFAULT_CONFIG.towns,
  );
  return {
    apiKey: typeof source.api_key === 'string' ? source.api_key.trim() : '',
    towns,
    invalidTowns: invalid,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

// -----------------------------------------------------------------------------
// AEMET OpenData HTTP client.
//
// The API answers in two steps: the endpoint returns a small JSON envelope
// (`{ descripcion, estado, datos, metadatos }`) whose `datos` is the URL of
// the actual data, to download next. Both requests count against the quota
// of the key. The key travels in the `api_key` header, never in a URL, and
// is never logged.
//
// The data files are served in ISO-8859-15 without always saying so: they
// are decoded from the charset of the response, ISO-8859-15 when none is
// given, or the Spanish names come out as "Legan�s".
// -----------------------------------------------------------------------------

export const API_URL = 'https://opendata.aemet.es/opendata/api';
// The `datos` URL comes from the response: only follow it to AEMET itself.
const DATA_URL_PATTERN = /^https:\/\/opendata\.aemet\.es\//;
const TIMEOUT_MS = 20_000;

/** Why a call failed, for the user message and the retry delay. */
export const ERROR_KINDS = {
  AUTH: 'auth', // key refused
  QUOTA: 'quota', // too many requests for this key
  NO_DATA: 'no-data', // "No hay datos que satisfagan esos criterios"
  HTTP: 'http', // any other refusal
  NETWORK: 'network', // DNS, connection, timeout
  FORMAT: 'format', // an answer that is not what the API documents
};

export class AemetError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message never contains the key
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'AemetError';
    this.kind = kind;
    this.status = status;
  }
}

function kindOfStatus(status) {
  if (status === 401 || status === 403) {
    return ERROR_KINDS.AUTH;
  }
  if (status === 404) {
    return ERROR_KINDS.NO_DATA;
  }
  if (status === 429) {
    return ERROR_KINDS.QUOTA;
  }
  return ERROR_KINDS.HTTP;
}

function charsetOf(response, fallback) {
  const type = response.headers.get('content-type') ?? '';
  const match = type.match(/charset=["']?([\w-]+)/i);
  return match ? match[1].toLowerCase() : fallback;
}

function decode(bytes, charset) {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('iso-8859-15').decode(bytes);
  }
}

export class AemetClient {
  /**
   * @param {object} options
   * @param {string} options.apiKey
   * @param {typeof fetch} [options.fetch]
   */
  constructor({ apiKey, fetch: fetchImpl = globalThis.fetch }) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    /** Last `Remaining-request-count` header seen (quota left), if any. */
    this.remaining = null;
  }

  async request(url, headers) {
    let response;
    try {
      response = await this.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new AemetError(ERROR_KINDS.NETWORK, `AEMET unreachable (${reason})`);
    }
    const remaining = response.headers.get('remaining-request-count');
    if (remaining !== null) {
      this.remaining = Number(remaining);
    }
    return response;
  }

  /**
   * Call an endpoint and download its data.
   * @param {string} path e.g. `prediccion/especifica/municipio/horaria/28079`
   * @param {{ binary?: boolean }} [options] binary: resolve the raw bytes (the warnings archive)
   * @returns {Promise<any>} the parsed JSON, or a Buffer when binary
   */
  async get(path, { binary = false } = {}) {
    const response = await this.request(`${API_URL}/${path}`, {
      api_key: this.apiKey,
      accept: 'application/json',
      'cache-control': 'no-cache',
    });
    const text = decode(new Uint8Array(await response.arrayBuffer()), charsetOf(response, 'utf-8'));
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new AemetError(
          kindOfStatus(response.status),
          `HTTP ${response.status}`,
          response.status,
        );
      }
      throw new AemetError(ERROR_KINDS.FORMAT, `${path}: not JSON`);
    }
    // The status lives in the envelope too: a refused key can come back as
    // an HTTP 200 carrying `estado: 401`.
    const status = Number(envelope?.estado ?? response.status);
    if (!response.ok || (Number.isFinite(status) && status !== 200)) {
      const code = response.ok ? status : response.status;
      const detail = typeof envelope?.descripcion === 'string' ? `: ${envelope.descripcion}` : '';
      throw new AemetError(kindOfStatus(code), `HTTP ${code}${detail}`.slice(0, 200), code);
    }
    // A few endpoints (the town master data) answer the data directly.
    if (Array.isArray(envelope) || typeof envelope?.datos !== 'string') {
      return envelope;
    }
    if (!DATA_URL_PATTERN.test(envelope.datos)) {
      throw new AemetError(ERROR_KINDS.FORMAT, `${path}: unexpected data URL`);
    }
    return this.download(envelope.datos, path, binary);
  }

  async download(url, path, binary) {
    const response = await this.request(url, { accept: '*/*' });
    if (!response.ok) {
      throw new AemetError(
        kindOfStatus(response.status),
        `${path}: data HTTP ${response.status}`,
        response.status,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (binary) {
      return bytes;
    }
    const text = decode(bytes, charsetOf(response, 'iso-8859-15'));
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AemetError(ERROR_KINDS.FORMAT, `${path}: data is not JSON`);
    }
    // An expired data URL answers an envelope instead of the data.
    if (data && !Array.isArray(data) && Number(data.estado) && Number(data.estado) !== 200) {
      const code = Number(data.estado);
      throw new AemetError(kindOfStatus(code), `${path}: data HTTP ${code}`, code);
    }
    return data;
  }

  // --- Endpoints ---------------------------------------------------------------

  /** One town of the master data: name, coordinates, warning zone. */
  async town(code) {
    const data = await this.get(`maestro/municipio/id${code}`);
    const town = Array.isArray(data) ? data[0] : data;
    if (!town || typeof town !== 'object') {
      throw new AemetError(ERROR_KINDS.NO_DATA, `town ${code}: not found`);
    }
    return town;
  }

  /** Every town (8,000+ entries, ~2 MB): only to find the nearest one. */
  towns() {
    return this.get('maestro/municipios');
  }

  hourlyForecast(code) {
    return this.get(`prediccion/especifica/municipio/horaria/${code}`);
  }

  dailyForecast(code) {
    return this.get(`prediccion/especifica/municipio/diaria/${code}`);
  }

  /** The last 12 hours of every station (several MB): only to find the nearest one. */
  stations() {
    return this.get('observacion/convencional/todas');
  }

  /** The last 12 hours of one station. */
  station(id) {
    return this.get(`observacion/convencional/datos/estacion/${encodeURIComponent(id)}`);
  }

  /**
   * The warnings in force for a region: a tar archive (gzipped or not) of CAP
   * files. `area` is the two-digit region code (61 Andalusia… 79 Melilla).
   */
  warnings(area) {
    return this.get(`avisos_cap/ultimoelaborado/area/${area}`, { binary: true });
  }
}

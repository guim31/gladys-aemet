// -----------------------------------------------------------------------------
// A fake AEMET OpenData, served through a `fetch` stand-in: the two-step API
// (an envelope, then the `datos` URL), the fixtures of test/fixtures/aemet,
// ISO-8859-15 data files and the warnings as a gzipped tar of CAP files.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { API_URL } from '../../src/aemet/client.js';

const dir = new URL('../fixtures/aemet/', import.meta.url);

/** A fixture, read as AEMET serves it (latin-1 bytes). */
export const fixture = (name) => JSON.parse(readFileSync(new URL(name, dir), 'latin1'));

export const CAP_FILES = readdirSync(new URL('cap/', dir))
  .filter((name) => name.endsWith('.xml'))
  .sort()
  .map((name) => ({ name, content: readFileSync(new URL(`cap/${name}`, dir), 'utf8') }));

/** A ustar archive of `{ name, content }` files. */
export function makeTar(files) {
  const blocks = [];
  for (const { name, content } of files) {
    const body = Buffer.from(content, 'utf8');
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    header.write('0000644\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
    header.write(
      `${Math.floor(Date.UTC(2021, 0, 9) / 1000)
        .toString(8)
        .padStart(11, '0')}\0`,
      136,
      'ascii',
    );
    header.write('        ', 148, 'ascii');
    header.write('0', 156, 'ascii');
    header.write('ustar\0' + '00', 257, 'ascii');
    let sum = 0;
    for (const byte of header) {
      sum += byte;
    }
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

export const KEY = 'eyJhbGciOiJIUzI1NiJ9.fake-test-key.signature';

/**
 * The default routes: Getafe (28065), its station, the region of Madrid.
 * A route is the data (sent through a `datos` URL), or a function of the
 * request returning it, or `{ status, body }` for the envelope itself.
 */
export function defaultRoutes() {
  return {
    'maestro/municipio/id28065': { direct: fixture('town-id28065.json') },
    'maestro/municipios': fixture('town-list.json'),
    'prediccion/especifica/municipio/horaria/28065': fixture(
      'town-28065-forecast-hourly-data.json',
    ),
    'prediccion/especifica/municipio/diaria/28065': fixture('town-28065-forecast-daily-data.json'),
    'observacion/convencional/todas': fixture('station-list-data.json'),
    'observacion/convencional/datos/estacion/3195': fixture('station-3195-data.json'),
    'avisos_cap/ultimoelaborado/area/72': { binary: gzipSync(makeTar(CAP_FILES)) },
  };
}

/**
 * A `fetch` serving the routes. `calls` records the API paths asked (the
 * data downloads are not counted); `headers` the request headers.
 */
export function createAemetFetch(routes = defaultRoutes()) {
  const calls = [];
  const requests = [];
  const datos = new Map();
  let counter = 0;
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, headers: { ...init.headers } });
    if (url.startsWith('https://opendata.aemet.es/opendata/sh/')) {
      const entry = datos.get(url);
      if (!entry) {
        return new Response('{"estado":404}', { status: 404 });
      }
      if (entry.binary) {
        return new Response(entry.binary, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
      }
      // AEMET sends the data in ISO-8859-15, and says so.
      return new Response(Buffer.from(JSON.stringify(entry.data), 'latin1'), {
        status: 200,
        headers: { 'content-type': 'text/plain;charset=ISO-8859-15' },
      });
    }
    const path = url.slice(API_URL.length + 1);
    calls.push(path);
    if (init.headers?.api_key !== KEY) {
      return Response.json({ descripcion: 'API key invalido', estado: 401 }, { status: 401 });
    }
    let route = routes[path];
    if (typeof route === 'function') {
      route = route(path);
    }
    if (route === undefined) {
      return Response.json(
        { descripcion: 'No hay datos que satisfagan esos criterios', estado: 404 },
        { status: 404 },
      );
    }
    if (route?.status) {
      return Response.json(route.body ?? { estado: route.status }, { status: route.status });
    }
    if (route?.direct) {
      return Response.json(route.direct);
    }
    counter += 1;
    const dataUrl = `https://opendata.aemet.es/opendata/sh/${counter.toString(16).padStart(8, '0')}`;
    datos.set(dataUrl, route?.binary ? { binary: route.binary } : { data: route });
    return Response.json({
      descripcion: 'exito',
      estado: 200,
      datos: dataUrl,
      metadatos: 'https://opendata.aemet.es/opendata/sh/metadata',
    });
  };
  return { fetch: fetchImpl, calls, requests, routes };
}

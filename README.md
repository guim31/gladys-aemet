# AEMET for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for **AEMET OpenData**, the open data service of
the Spanish State Meteorological Agency: the official weather of Spain (mainland, Balearic and Canary Islands,
Ceuta, Melilla), for holiday homes and cross-border residents.

> **Developed without the hardware: feedback welcome.** No AEMET key was at hand during development: the
> integration is tested against real AEMET answers published with the Home Assistant integration, and
> against warning files built after the CAP format AEMET documents. `scripts/probe.mjs` checks the real API.

Not affiliated with AEMET. Data © AEMET, used under its
[terms of use](https://www.aemet.es/en/nota_legal) (AEMET must be credited as the source).

## What it does

One read-only device **per town** (up to five), refreshed by the integration itself:

- **forecast of the current hour**: temperature, feels-like, humidity, wind, gusts, wind direction, chance of
  rain, rain expected this hour, sky state (translated);
- **today**: UV index (daily maximum), minimum and maximum temperatures;
- **Meteoalerta warnings**: level in force (0 to 3), highest level ahead, and a text listing them;
- **nearest station** (40 km at most): observed temperature, humidity, pressure, last hour's rain, wind.

Plus a dashboard widget **AEMET forecast** (live values, the next five days, the warnings) and a scene
trigger **New AEMET warning** (filters: town, level, phenomenon), fired once per warning, even days ahead,
and again when AEMET raises its level.

Texts in English, French, German and Spanish. The full user documentation is in [`docs/`](./docs/en.md)
(also [fr](./docs/fr.md), [de](./docs/de.md), [es](./docs/es.md)).

## Requirements

- Gladys **5.2.0** or later.
- A free AEMET OpenData API key:
  [request it here](https://opendata.aemet.es/centrodedescargas/altaUsuario) (it arrives by email).
- Internet access from Gladys (`opendata.aemet.es` only).

## Installation

In Gladys: **Integrations → Install from GitHub**, then `https://github.com/guim31/gladys-aemet`. Fill in the
API key and the INE codes of the towns (or run **Find the nearest town** on a Gladys house), then add the
devices from the **Discovery** tab.

## Refresh and quota

AEMET limits the requests of each key; each reading is two requests (an envelope, then the data). Per town
added to Gladys: forecasts and station every 30 minutes, warnings every 10 minutes (once per region), about
24 requests an hour. Failures wait 5 minutes (15 after a quota refusal). The integration polls by itself and
does not depend on the core polling it ([Gladys#3198](https://github.com/GladysAssistant/Gladys/issues/3198)).

## Limits

- Spain only. Coastal warnings concern sea zones and may not reach a seaside town.
- The nearest station is picked automatically (no override).
- Feature names are frozen when the device is added (a Gladys rule).
- Read only: nothing to command.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
AEMET_API_KEY=... node scripts/probe.mjs 28079          # the real API, read only
AEMET_API_KEY=... node scripts/probe.mjs 28079 --save /tmp/aemet   # raw answers, to refresh fixtures
```

Without `AEMET_API_KEY`, the probe uses a fake key and stops at AEMET's refusal. It never prints the key.
See [`CLAUDE.md`](./CLAUDE.md) for the architecture and the pitfalls of the AEMET API and of the Gladys core.

## Credits

- [AEMET OpenData](https://opendata.aemet.es/), the data.
- The Home Assistant [`aemet` integration](https://www.home-assistant.io/integrations/aemet) by
  [@Noltari](https://github.com/Noltari) (Apache-2.0): its test fixtures (real AEMET answers) are reused in
  `test/fixtures/aemet`.
- [`AEMET-OpenData`](https://github.com/Noltari/AEMET-OpenData) by Álvaro Fernández Rojas (GPL-2.0): read to
  understand the API, not copied.
- The [Gladys Assistant](https://github.com/GladysAssistant) integration template and SDK.

## License

[Apache-2.0](./LICENSE)

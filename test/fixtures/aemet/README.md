# AEMET fixtures

- `town-*.json`, `station-*.json`: real AEMET OpenData answers (Getafe, INE 28065,
  9 January 2021, storm Filomena), taken from the tests of the Home Assistant
  `aemet` integration (Apache-2.0,
  [home-assistant/core](https://github.com/home-assistant/core/tree/dev/tests/components/aemet/fixtures)).
  They kept the replacement character `�` where AEMET wrote ISO-8859-15 letters.
- `cap/*.xml`: Meteoalerta warnings written after the CAP 1.2 format AEMET
  publishes (annex 3 of the Meteoalerta plan, `AEMET-Meteoalerta nivel`,
  `fenomeno` and `zona`), for the zones of Madrid on the Filomena days. AEMET
  OpenData could not be reached from the development session: replace them
  with real files from `scripts/probe.mjs --save <dir>` when possible.

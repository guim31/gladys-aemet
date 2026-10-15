# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One read-only device per Spanish town (up to five, by INE code), from AEMET
  OpenData: forecast of the current hour (temperature, feels-like, humidity,
  wind, gusts, wind direction, chance of rain, rain, translated sky state),
  today's UV index, minimum and maximum.
- Meteoalerta warnings of the town: level in force, highest level ahead and a
  text listing them (phenomenon, start).
- The observation of the nearest AEMET station (40 km at most): temperature,
  humidity, pressure, last hour's rain, wind.
- Dashboard widget "AEMET forecast": live values, the next five days and the
  warnings.
- Scene trigger "New AEMET warning", filtered by town, level and phenomenon,
  fired once per warning and again when its level rises.
- Actions "Test the connection" and "Find the nearest town" (from a Gladys
  house).
- Refreshed by the integration itself, within the API quota: forecasts and
  station every 30 minutes, warnings every 10 minutes.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/guim31/gladys-aemet/commits/main

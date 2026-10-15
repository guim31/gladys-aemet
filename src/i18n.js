// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). The core gives a widget the user's language;
// the feature names, the scene event texts and the action messages follow
// the `language` field of the configuration. German says "du", Spanish
// says "usted", like the rest of guim31's integrations. AEMET, Meteoalerta
// and place names are never translated.
//
// test/i18n.test.js checks that every table carries the four languages with
// the same keys, and no empty or too long text.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** Feature names, frozen by Gladys when the device is created. */
export const FEATURE_NAMES = {
  en: {
    temperature: 'Temperature (forecast)',
    feelsLike: 'Feels like',
    humidity: 'Humidity (forecast)',
    windSpeed: 'Wind (forecast)',
    windGust: 'Wind gusts (forecast)',
    windDirection: 'Wind direction',
    rainProbability: 'Chance of rain',
    precipitation: 'Rain this hour (forecast)',
    sky: 'Sky',
    uv: 'UV index (today’s max)',
    todayMin: 'Minimum today',
    todayMax: 'Maximum today',
    warningLevel: 'Warning level now',
    warningUpcoming: 'Highest warning ahead',
    warningText: 'Warnings',
    obsTemperature: 'Observed temperature',
    obsHumidity: 'Observed humidity',
    obsPressure: 'Pressure (station)',
    obsPrecipitation: 'Rain last hour (station)',
    obsWind: 'Observed wind',
  },
  fr: {
    temperature: 'Température (prévision)',
    feelsLike: 'Ressenti',
    humidity: 'Humidité (prévision)',
    windSpeed: 'Vent (prévision)',
    windGust: 'Rafales (prévision)',
    windDirection: 'Direction du vent',
    rainProbability: 'Probabilité de pluie',
    precipitation: 'Pluie de l’heure (prévision)',
    sky: 'Ciel',
    uv: 'Indice UV (max du jour)',
    todayMin: 'Minimale du jour',
    todayMax: 'Maximale du jour',
    warningLevel: 'Niveau d’avertissement actuel',
    warningUpcoming: 'Avertissement le plus haut à venir',
    warningText: 'Avertissements',
    obsTemperature: 'Température observée',
    obsHumidity: 'Humidité observée',
    obsPressure: 'Pression (station)',
    obsPrecipitation: 'Pluie de l’heure passée (station)',
    obsWind: 'Vent observé',
  },
  de: {
    temperature: 'Temperatur (Vorhersage)',
    feelsLike: 'Gefühlte Temperatur',
    humidity: 'Luftfeuchtigkeit (Vorhersage)',
    windSpeed: 'Wind (Vorhersage)',
    windGust: 'Windböen (Vorhersage)',
    windDirection: 'Windrichtung',
    rainProbability: 'Regenwahrscheinlichkeit',
    precipitation: 'Regen dieser Stunde (Vorhersage)',
    sky: 'Himmel',
    uv: 'UV-Index (Tagesmaximum)',
    todayMin: 'Tiefstwert heute',
    todayMax: 'Höchstwert heute',
    warningLevel: 'Aktuelle Warnstufe',
    warningUpcoming: 'Höchste kommende Warnstufe',
    warningText: 'Warnungen',
    obsTemperature: 'Gemessene Temperatur',
    obsHumidity: 'Gemessene Luftfeuchtigkeit',
    obsPressure: 'Luftdruck (Station)',
    obsPrecipitation: 'Regen letzte Stunde (Station)',
    obsWind: 'Gemessener Wind',
  },
  es: {
    temperature: 'Temperatura (previsión)',
    feelsLike: 'Sensación térmica',
    humidity: 'Humedad (previsión)',
    windSpeed: 'Viento (previsión)',
    windGust: 'Rachas (previsión)',
    windDirection: 'Dirección del viento',
    rainProbability: 'Probabilidad de lluvia',
    precipitation: 'Lluvia de esta hora (previsión)',
    sky: 'Cielo',
    uv: 'Índice UV (máximo del día)',
    todayMin: 'Mínima del día',
    todayMax: 'Máxima del día',
    warningLevel: 'Nivel de aviso actual',
    warningUpcoming: 'Aviso más alto previsto',
    warningText: 'Avisos',
    obsTemperature: 'Temperatura observada',
    obsHumidity: 'Humedad observada',
    obsPressure: 'Presión (estación)',
    obsPrecipitation: 'Lluvia última hora (estación)',
    obsWind: 'Viento observado',
  },
};

/** The sky states of AEMET (`estadoCielo`, without the night "n"). */
export const SKY = {
  en: {
    11: 'Clear',
    12: 'Few clouds',
    13: 'Partly cloudy',
    14: 'Cloudy',
    15: 'Very cloudy',
    16: 'Overcast',
    17: 'High clouds',
    23: 'Partly cloudy with rain',
    24: 'Cloudy with rain',
    25: 'Very cloudy with rain',
    26: 'Overcast with rain',
    27: 'Showers',
    33: 'Partly cloudy with snow',
    34: 'Cloudy with snow',
    35: 'Very cloudy with snow',
    36: 'Overcast with snow',
    43: 'Partly cloudy, light rain',
    44: 'Cloudy, light rain',
    45: 'Very cloudy, light rain',
    46: 'Overcast, light rain',
    51: 'Partly cloudy with storms',
    52: 'Cloudy with storms',
    53: 'Very cloudy with storms',
    54: 'Overcast with storms',
    61: 'Partly cloudy, storms, light rain',
    62: 'Cloudy, storms, light rain',
    63: 'Very cloudy, storms, light rain',
    64: 'Overcast, storms, light rain',
    71: 'Partly cloudy, light snow',
    72: 'Cloudy, light snow',
    73: 'Very cloudy, light snow',
    74: 'Overcast, light snow',
    81: 'Fog',
    82: 'Mist',
    83: 'Haze',
  },
  fr: {
    11: 'Dégagé',
    12: 'Peu nuageux',
    13: 'Éclaircies',
    14: 'Nuageux',
    15: 'Très nuageux',
    16: 'Couvert',
    17: 'Nuages élevés',
    23: 'Éclaircies et pluie',
    24: 'Nuageux avec pluie',
    25: 'Très nuageux avec pluie',
    26: 'Couvert avec pluie',
    27: 'Averses',
    33: 'Éclaircies et neige',
    34: 'Nuageux avec neige',
    35: 'Très nuageux avec neige',
    36: 'Couvert avec neige',
    43: 'Éclaircies, pluie faible',
    44: 'Nuageux, pluie faible',
    45: 'Très nuageux, pluie faible',
    46: 'Couvert, pluie faible',
    51: 'Éclaircies et orages',
    52: 'Nuageux avec orages',
    53: 'Très nuageux avec orages',
    54: 'Couvert avec orages',
    61: 'Éclaircies, orages, pluie faible',
    62: 'Nuageux, orages, pluie faible',
    63: 'Très nuageux, orages, pluie faible',
    64: 'Couvert, orages, pluie faible',
    71: 'Éclaircies, neige faible',
    72: 'Nuageux, neige faible',
    73: 'Très nuageux, neige faible',
    74: 'Couvert, neige faible',
    81: 'Brouillard',
    82: 'Brume',
    83: 'Brume sèche (calima)',
  },
  de: {
    11: 'Klar',
    12: 'Leicht bewölkt',
    13: 'Wolkig mit Aufheiterungen',
    14: 'Bewölkt',
    15: 'Stark bewölkt',
    16: 'Bedeckt',
    17: 'Hohe Wolken',
    23: 'Aufheiterungen und Regen',
    24: 'Bewölkt mit Regen',
    25: 'Stark bewölkt mit Regen',
    26: 'Bedeckt mit Regen',
    27: 'Schauer',
    33: 'Aufheiterungen und Schnee',
    34: 'Bewölkt mit Schnee',
    35: 'Stark bewölkt mit Schnee',
    36: 'Bedeckt mit Schnee',
    43: 'Aufheiterungen, leichter Regen',
    44: 'Bewölkt, leichter Regen',
    45: 'Stark bewölkt, leichter Regen',
    46: 'Bedeckt, leichter Regen',
    51: 'Aufheiterungen und Gewitter',
    52: 'Bewölkt mit Gewitter',
    53: 'Stark bewölkt mit Gewitter',
    54: 'Bedeckt mit Gewitter',
    61: 'Aufheiterungen, Gewitter, leichter Regen',
    62: 'Bewölkt, Gewitter, leichter Regen',
    63: 'Stark bewölkt, Gewitter, leichter Regen',
    64: 'Bedeckt, Gewitter, leichter Regen',
    71: 'Aufheiterungen, leichter Schnee',
    72: 'Bewölkt, leichter Schnee',
    73: 'Stark bewölkt, leichter Schnee',
    74: 'Bedeckt, leichter Schnee',
    81: 'Nebel',
    82: 'Dunst',
    83: 'Staubdunst (Calima)',
  },
  es: {
    11: 'Despejado',
    12: 'Poco nuboso',
    13: 'Intervalos nubosos',
    14: 'Nuboso',
    15: 'Muy nuboso',
    16: 'Cubierto',
    17: 'Nubes altas',
    23: 'Intervalos nubosos con lluvia',
    24: 'Nuboso con lluvia',
    25: 'Muy nuboso con lluvia',
    26: 'Cubierto con lluvia',
    27: 'Chubascos',
    33: 'Intervalos nubosos con nieve',
    34: 'Nuboso con nieve',
    35: 'Muy nuboso con nieve',
    36: 'Cubierto con nieve',
    43: 'Intervalos nubosos con lluvia escasa',
    44: 'Nuboso con lluvia escasa',
    45: 'Muy nuboso con lluvia escasa',
    46: 'Cubierto con lluvia escasa',
    51: 'Intervalos nubosos con tormenta',
    52: 'Nuboso con tormenta',
    53: 'Muy nuboso con tormenta',
    54: 'Cubierto con tormenta',
    61: 'Intervalos nubosos con tormenta y lluvia escasa',
    62: 'Nuboso con tormenta y lluvia escasa',
    63: 'Muy nuboso con tormenta y lluvia escasa',
    64: 'Cubierto con tormenta y lluvia escasa',
    71: 'Intervalos nubosos con nieve escasa',
    72: 'Nuboso con nieve escasa',
    73: 'Muy nuboso con nieve escasa',
    74: 'Cubierto con nieve escasa',
    81: 'Niebla',
    82: 'Bruma',
    83: 'Calima',
  },
};

/** The Meteoalerta phenomena (keys of PHENOMENA in src/aemet/warnings.js). */
export const PHENOMENON_NAMES = {
  en: {
    rain: 'Rain',
    snow: 'Snow',
    wind: 'Wind',
    thunderstorm: 'Thunderstorms',
    heat: 'High temperatures',
    cold: 'Low temperatures',
    coastal: 'Coastal events',
    fog: 'Fog',
    dust: 'Dust',
    avalanche: 'Avalanches',
    rissaga: 'Rissaga',
    thaw: 'Thaw',
    other: 'Other phenomenon',
  },
  fr: {
    rain: 'Pluie',
    snow: 'Neige',
    wind: 'Vent',
    thunderstorm: 'Orages',
    heat: 'Fortes chaleurs',
    cold: 'Grand froid',
    coastal: 'Phénomènes côtiers',
    fog: 'Brouillard',
    dust: 'Poussières',
    avalanche: 'Avalanches',
    rissaga: 'Rissaga',
    thaw: 'Dégel',
    other: 'Autre phénomène',
  },
  de: {
    rain: 'Regen',
    snow: 'Schnee',
    wind: 'Wind',
    thunderstorm: 'Gewitter',
    heat: 'Hohe Temperaturen',
    cold: 'Tiefe Temperaturen',
    coastal: 'Küstenereignisse',
    fog: 'Nebel',
    dust: 'Staub',
    avalanche: 'Lawinen',
    rissaga: 'Rissaga',
    thaw: 'Tauwetter',
    other: 'Anderes Ereignis',
  },
  es: {
    rain: 'Lluvias',
    snow: 'Nevadas',
    wind: 'Vientos',
    thunderstorm: 'Tormentas',
    heat: 'Temperaturas máximas',
    cold: 'Temperaturas mínimas',
    coastal: 'Fenómenos costeros',
    fog: 'Nieblas',
    dust: 'Polvo en suspensión',
    avalanche: 'Aludes',
    rissaga: 'Rissagas',
    thaw: 'Deshielos',
    other: 'Otro fenómeno',
  },
};

/** The warning levels (index = level). */
export const LEVEL_TEXT = {
  en: { 0: 'No warning', 1: 'Yellow', 2: 'Orange', 3: 'Red' },
  fr: { 0: 'Aucun avertissement', 1: 'Jaune', 2: 'Orange', 3: 'Rouge' },
  de: { 0: 'Keine Warnung', 1: 'Gelb', 2: 'Orange', 3: 'Rot' },
  es: { 0: 'Sin avisos', 1: 'Amarillo', 2: 'Naranja', 3: 'Rojo' },
};

/** Short week days, Sunday first. */
export const WEEKDAYS = {
  en: { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' },
  fr: { 0: 'dim.', 1: 'lun.', 2: 'mar.', 3: 'mer.', 4: 'jeu.', 5: 'ven.', 6: 'sam.' },
  de: { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' },
  es: { 0: 'dom', 1: 'lun', 2: 'mar', 3: 'mié', 4: 'jue', 5: 'vie', 6: 'sáb' },
};

/** Fixed texts, one multi-language object each. */
export const TEXT = {
  // Widget
  now: { en: 'Now', fr: 'Maintenant', de: 'Jetzt', es: 'Ahora' },
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  rain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia' },
  wind: { en: 'Wind', fr: 'Vent', de: 'Wind', es: 'Viento' },
  uv: { en: 'UV', fr: 'UV', de: 'UV', es: 'UV' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  noWarning: {
    en: 'No warning',
    fr: 'Aucun avertissement',
    de: 'Keine Warnung',
    es: 'Sin avisos',
  },
  inForce: { en: 'in force', fr: 'en cours', de: 'aktiv', es: 'en vigor' },
  from: { en: 'from', fr: 'dès', de: 'ab', es: 'desde' },
  until: { en: 'until', fr: 'jusqu’à', de: 'bis', es: 'hasta' },
  noData: {
    en: 'No AEMET data yet: the first reading takes a few seconds, check the configuration if it lasts.',
    fr: 'Pas encore de données AEMET : la première relève prend quelques secondes, vérifiez la configuration si cela dure.',
    de: 'Noch keine AEMET-Daten: Die erste Abfrage dauert ein paar Sekunden, prüfe die Konfiguration, wenn es länger dauert.',
    es: 'Aún no hay datos de AEMET: la primera consulta tarda unos segundos, revise la configuración si se prolonga.',
  },
  pickDevice: {
    en: 'Pick an AEMET town in the widget settings.',
    fr: 'Choisissez une commune AEMET dans les réglages du widget.',
    de: 'Wähle eine AEMET-Gemeinde in den Einstellungen des Widgets.',
    es: 'Elija un municipio de AEMET en los ajustes del widget.',
  },
  attribution: {
    en: 'Source: AEMET',
    fr: 'Source : AEMET',
    de: 'Quelle: AEMET',
    es: 'Fuente: AEMET',
  },

  // Configuration screen and actions
  missingKey: {
    en: 'Enter your AEMET OpenData API key.',
    fr: 'Saisissez votre clé d’API AEMET OpenData.',
    de: 'Gib deinen AEMET-OpenData-API-Schlüssel ein.',
    es: 'Introduzca su clave de API de AEMET OpenData.',
  },
  missingTowns: {
    en: 'Add a town: its INE code, or the action "Find the nearest town".',
    fr: 'Ajoutez une commune : son code INE, ou l’action « Trouver la commune la plus proche ».',
    de: 'Füge eine Gemeinde hinzu: ihren INE-Code oder die Aktion „Nächste Gemeinde finden“.',
    es: 'Añada un municipio: su código INE, o la acción «Buscar el municipio más cercano».',
  },
  keyRefused: {
    en: 'AEMET refused the API key: check it, or ask for a new one.',
    fr: 'AEMET a refusé la clé d’API : vérifiez-la, ou demandez-en une nouvelle.',
    de: 'AEMET hat den API-Schlüssel abgelehnt: Prüfe ihn oder fordere einen neuen an.',
    es: 'AEMET ha rechazado la clave de API: compruébela o solicite una nueva.',
  },
  quota: {
    en: 'AEMET limits the requests of this key: the readings resume in a few minutes.',
    fr: 'AEMET limite les requêtes de cette clé : les relevés reprennent dans quelques minutes.',
    de: 'AEMET begrenzt die Anfragen dieses Schlüssels: Die Abfragen laufen in ein paar Minuten weiter.',
    es: 'AEMET limita las peticiones de esta clave: las consultas se reanudarán en unos minutos.',
  },
  unreachable: {
    en: 'AEMET OpenData is unreachable: the readings resume on their own.',
    fr: 'AEMET OpenData est injoignable : les relevés reprendront d’eux-mêmes.',
    de: 'AEMET OpenData ist nicht erreichbar: Die Abfragen laufen von selbst weiter.',
    es: 'AEMET OpenData no está disponible: las consultas se reanudarán solas.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les logs de l’intégration.',
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  houseWithoutLocation: {
    en: 'This house has no position: set it in Gladys (Settings → Houses).',
    fr: 'Cette maison n’a pas de position : renseignez-la dans Gladys (Paramètres → Maisons).',
    de: 'Dieses Zuhause hat keine Position: Lege sie in Gladys fest (Einstellungen → Häuser).',
    es: 'Esta casa no tiene posición: defínala en Gladys (Parámetros → Casas).',
  },
  noTownNearby: {
    en: 'No Spanish town within 40 km of this house: AEMET only covers Spain.',
    fr: 'Aucune commune espagnole à moins de 40 km de cette maison : AEMET ne couvre que l’Espagne.',
    de: 'Keine spanische Gemeinde im Umkreis von 40 km um dieses Zuhause: AEMET deckt nur Spanien ab.',
    es: 'No hay ningún municipio español a menos de 40 km de esta casa: AEMET solo cubre España.',
  },
  tooManyTowns: {
    en: 'Five towns at most: remove one from the configuration first.',
    fr: 'Cinq communes au plus : retirez-en une de la configuration d’abord.',
    de: 'Höchstens fünf Gemeinden: Entferne zuerst eine aus der Konfiguration.',
    es: 'Cinco municipios como máximo: quite uno de la configuración primero.',
  },
};

/** Messages built from values. */
export const MESSAGES = {
  en: {
    townAdded: (name, code, km) =>
      `${name} (INE ${code}, ${km} km away) added. Reload the page to see it in the "Towns" field, then look in the Discovery tab.`,
    townKnown: (name, code, km) =>
      `${name} (INE ${code}, ${km} km away) is already in the configuration.`,
    testOk: (names) => `AEMET answers. Towns: ${names}.`,
    testTownFailed: (code, reason) => `Town ${code}: ${reason}`,
    invalidTowns: (list) => `Ignored codes (5 digits expected): ${list}.`,
    stationFor: (town, station, km) => `${town}: station ${station} (${km} km)`,
    noStationFor: (town) => `${town}: no station within 40 km`,
  },
  fr: {
    townAdded: (name, code, km) =>
      `${name} (INE ${code}, à ${km} km) ajoutée. Rechargez la page pour la voir dans le champ « Communes », puis regardez l’onglet Découverte.`,
    townKnown: (name, code, km) =>
      `${name} (INE ${code}, à ${km} km) est déjà dans la configuration.`,
    testOk: (names) => `AEMET répond. Communes : ${names}.`,
    testTownFailed: (code, reason) => `Commune ${code} : ${reason}`,
    invalidTowns: (list) => `Codes ignorés (5 chiffres attendus) : ${list}.`,
    stationFor: (town, station, km) => `${town} : station ${station} (${km} km)`,
    noStationFor: (town) => `${town} : aucune station à moins de 40 km`,
  },
  de: {
    townAdded: (name, code, km) =>
      `${name} (INE ${code}, ${km} km entfernt) hinzugefügt. Lade die Seite neu, um sie im Feld „Gemeinden“ zu sehen, und schau dann in den Tab „Entdecken“.`,
    townKnown: (name, code, km) =>
      `${name} (INE ${code}, ${km} km entfernt) ist schon in der Konfiguration.`,
    testOk: (names) => `AEMET antwortet. Gemeinden: ${names}.`,
    testTownFailed: (code, reason) => `Gemeinde ${code}: ${reason}`,
    invalidTowns: (list) => `Ignorierte Codes (5 Ziffern erwartet): ${list}.`,
    stationFor: (town, station, km) => `${town}: Station ${station} (${km} km)`,
    noStationFor: (town) => `${town}: keine Station im Umkreis von 40 km`,
  },
  es: {
    townAdded: (name, code, km) =>
      `${name} (INE ${code}, a ${km} km) añadido. Recargue la página para verlo en el campo «Municipios» y consulte después la pestaña Descubrimiento.`,
    townKnown: (name, code, km) => `${name} (INE ${code}, a ${km} km) ya está en la configuración.`,
    testOk: (names) => `AEMET responde. Municipios: ${names}.`,
    testTownFailed: (code, reason) => `Municipio ${code}: ${reason}`,
    invalidTowns: (list) => `Códigos ignorados (se esperan 5 cifras): ${list}.`,
    stationFor: (town, station, km) => `${town}: estación ${station} (${km} km)`,
    noStationFor: (town) => `${town}: ninguna estación a menos de 40 km`,
  },
};

/** `{ en, fr, de, es }` from a MESSAGES entry and its arguments. */
export function message(key, ...args) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, MESSAGES[lang][key](...args)]));
}

/** One language of a multi-language object, English otherwise. */
export function pick(texts, language) {
  return texts?.[language] ?? texts?.en;
}

/** The text of a sky state in a language ("36n" → "Overcast with snow"). */
export function skyText(sky, language) {
  if (!sky) {
    return null;
  }
  return SKY[language]?.[sky.code] ?? SKY.en[sky.code] ?? null;
}

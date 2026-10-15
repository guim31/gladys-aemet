// -----------------------------------------------------------------------------
// Dashboard widget "AEMET forecast": for the town chosen in its settings, the
// live values of its device, the next days and the Meteoalerta warnings.
//
// Budget of the core: 8 components at most, 2 texts. Here: a heading, four
// live tiles, the days (card-list grid), the warnings (status) and the
// attribution caption — 8. The content is cached by the core per settings,
// language and units: it is localized here from `language`. Read only: no
// button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localParts } from './aemet/geo.js';
import { isActive } from './aemet/warnings.js';
import { codeOfDevice, shortTime, townIds } from './devices.js';
import { LEVEL_TEXT, PHENOMENON_NAMES, TEXT, WEEKDAYS, pick, skyText } from './i18n.js';
import { WIDGET_KEY } from './hub.js';

const DAYS_SHOWN = 5;
const LEVEL_COLORS = [
  WIDGET_COLORS.SUCCESS,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.DANGER,
  WIDGET_COLORS.DANGER,
];

const degrees = (value) => (typeof value === 'number' ? `${Math.round(value)}°` : '–');

/**
 * The widget content for one town.
 * @param {object} hub AemetHub
 * @param {{ settings?: { device?: string }, language?: string }} request
 */
export function forecastContent(hub, { settings, language = 'en' }) {
  const code = codeOfDevice(hub.gladys, settings?.device);
  const snapshot = code && hub.config?.towns.includes(code) ? hub.snapshot(code) : null;
  if (!code || !hub.config?.towns.includes(code)) {
    return {
      ttl_seconds: 600,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.pickDevice, language) }],
    };
  }
  if (!snapshot || (!snapshot.hour && snapshot.days.length === 0 && !snapshot.warningsKnown)) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.noData, language) }],
    };
  }
  const ids = townIds(hub.gladys, code);
  const now = new Date(hub.now());
  const components = [
    { type: 'text', variant: 'heading', text: snapshot.town.name.slice(0, 40) },
    {
      type: 'value',
      label: pick(TEXT.temperature, language),
      device_feature: ids.feature('temperature'),
    },
    {
      type: 'value',
      label: pick(TEXT.rain, language),
      device_feature: ids.feature('rain-probability'),
    },
    { type: 'value', label: pick(TEXT.wind, language), device_feature: ids.feature('wind-speed') },
    { type: 'value', label: pick(TEXT.uv, language), device_feature: ids.feature('uv-index') },
  ];

  if (snapshot.days.length > 0) {
    const weekdays = pick(WEEKDAYS, language);
    const today = localParts(now, snapshot.timeZone).date;
    components.push({
      type: 'card-list',
      display: 'grid',
      items: snapshot.days.slice(0, DAYS_SHOWN).map((day) => {
        const [year, month, date] = day.date.split('-').map(Number);
        const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
        const item = {
          title: day.date === today ? pick(TEXT.today, language) : `${weekdays[weekday]} ${date}`,
          subtitle: [skyText(day.sky, language), `${degrees(day.min)} / ${degrees(day.max)}`]
            .filter(Boolean)
            .join(' · '),
        };
        if (typeof day.rainProbability === 'number') {
          item.badge = {
            text: `${Math.round(day.rainProbability)} %`,
            color: day.rainProbability >= 50 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
          };
        }
        return item;
      }),
    });
  }

  if (snapshot.warningsKnown) {
    const levels = pick(LEVEL_TEXT, language);
    const phenomena = pick(PHENOMENON_NAMES, language);
    const items = snapshot.warnings.slice(0, 10).map((warning) => ({
      label: `${levels[warning.level]}: ${phenomena[warning.phenomenon]}`.slice(0, 40),
      value: (isActive(warning, now)
        ? pick(TEXT.inForce, language)
        : `${pick(TEXT.from, language)} ${shortTime(warning.onset, language, snapshot.timeZone)}`
      ).slice(0, 40),
      icon: 'alert-triangle',
      color: LEVEL_COLORS[warning.level],
    }));
    components.push({
      type: 'status',
      items:
        items.length > 0
          ? items
          : [
              {
                label: 'Meteoalerta',
                value: pick(TEXT.noWarning, language),
                icon: 'check-circle',
                color: WIDGET_COLORS.SUCCESS,
              },
            ],
    });
  }

  components.push({ type: 'text', variant: 'caption', text: pick(TEXT.attribution, language) });
  return { ttl_seconds: 600, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => forecastContent(hub, request),
  },
};

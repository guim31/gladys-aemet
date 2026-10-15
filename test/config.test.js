import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, MAX_TOWNS, normalizeConfig, parseTowns } from '../src/config.js';

test('town codes: INE codes, the AEMET form and a pasted URL, five at most', () => {
  assert.deepEqual(
    parseTowns(
      '28079, 07040;35016\n id28065  https://www.aemet.es/es/eltiempo/prediccion/municipios/getafe-id28065',
    ),
    {
      towns: ['28079', '07040', '35016', '28065'],
      invalid: [],
    },
  );
  assert.deepEqual(parseTowns('2807, 99001, abc, 00001'), {
    towns: [],
    invalid: ['2807', '99001', 'abc', '00001'],
  });
  assert.equal(parseTowns('28001 28002 28003 28004 28005 28006').towns.length, MAX_TOWNS);
  assert.deepEqual(parseTowns(undefined), { towns: [], invalid: [] });
});

test('the configuration is normalized, French by default', () => {
  assert.deepEqual(normalizeConfig(), {
    apiKey: '',
    towns: [],
    invalidTowns: [],
    language: 'fr',
  });
  assert.equal(DEFAULT_CONFIG.language, 'fr');
  assert.deepEqual(normalizeConfig({ api_key: ' k ', towns: '51001', language: 'it' }), {
    apiKey: 'k',
    towns: ['51001'],
    invalidTowns: [],
    language: 'fr',
  });
});

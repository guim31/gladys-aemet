// -----------------------------------------------------------------------------
// The "AEMET forecast" widget: within the core budget (validateWidgetContent
// of the SDK), every live tile bound to a feature the device really has, and
// localized from the language the core passes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { createWorld } from './helpers/world.js';

async function content(gladys, settings, language = 'en') {
  const ack = await gladys.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true);
  return ack.data.content;
}

test('the widget fits the core budget, its tiles are features of the device', async () => {
  const { gladys, hub } = await createWorld();
  const [device] = gladys.fake.discoveredDevices;
  const featureIds = new Set(device.features.map((f) => f.external_id));
  for (const language of ['en', 'fr', 'de', 'es']) {
    const widget = await content(gladys, { device: device.external_id }, language);
    assert.deepEqual(validateWidgetContent(widget), [], language);
    assert.equal(widget.components.length, 8);
    for (const component of widget.components.filter((c) => c.device_feature)) {
      assert.ok(featureIds.has(component.device_feature), component.device_feature);
    }
  }
  await hub.stop();
});

test('the widget shows the next days and the warnings, in the user language', async () => {
  const { gladys, hub } = await createWorld();
  const [device] = gladys.fake.discoveredDevices;
  const widget = await content(gladys, { device: device.external_id }, 'es');
  const days = widget.components.find((c) => c.type === 'card-list');
  assert.equal(days.items.length, 5);
  assert.deepEqual(days.items[0], {
    title: 'Hoy',
    subtitle: 'Cubierto con nieve · -1° / 2°',
    badge: { text: '100 %', color: 'info' },
  });
  assert.equal(days.items[1].title, 'dom 10');
  const status = widget.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value, i.color]),
    [
      ['Rojo: Nevadas', 'en vigor', 'danger'],
      ['Naranja: Temperaturas mínimas', 'desde lun, 00:00', 'danger'],
    ],
  );
  await hub.stop();
});

test('without a town, or before the first reading, the widget says what to do', async () => {
  const { gladys, hub } = await createWorld();
  let widget = await content(gladys, {}, 'de');
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.match(widget.components[0].text, /Wähle eine AEMET-Gemeinde/);

  widget = await content(gladys, { device: gladys.externalId('town:99999') }, 'fr');
  assert.match(widget.components[0].text, /Choisissez une commune/);
  await hub.stop();

  const empty = await createWorld({ create: false });
  widget = await content(empty.gladys, {
    device: empty.gladys.fake.discoveredDevices[0].external_id,
  });
  assert.match(widget.components[0].text, /No AEMET data yet/);
  await empty.hub.stop();
});

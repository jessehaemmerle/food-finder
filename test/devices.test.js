import test from 'node:test';
import assert from 'node:assert/strict';
import { listDevices, detectDevices, deviceVerdict } from '../server/core/devices.js';

const level = (text, id) => detectDevices(text).find((d) => d.id === id)?.level;

test('catalogue has the three groups with the spec devices', () => {
  const { groups } = listDevices();
  assert.deepEqual(groups.map((g) => g.id), ['mixer', 'cook', 'other']);
  const ids = groups.flatMap((g) => g.devices.map((d) => d.id));
  for (const id of ['stabmixer', 'standmixer', 'thermomix', 'kuechenmaschine', 'zerkleinerer', 'backofen', 'mikrowelle', 'heissluftfritteuse', 'dampfgarer', 'slowcooker', 'schnellkochtopf', 'reiskocher', 'toaster', 'waffeleisen', 'sandwichmaker', 'grill', 'eismaschine', 'brotbackautomat', 'wok', 'sousvide', 'fritteuse']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('explicit device names are required', () => {
  assert.equal(level('Mit dem Thermomix 10 Min/Stufe 5 pürieren', 'thermomix'), 'required');
  assert.equal(level('Die Suppe mit dem Stabmixer pürieren', 'stabmixer'), 'required');
  assert.equal(level('puree with an immersion blender', 'stabmixer'), 'required');
  assert.equal(level('Den Backofen auf 200 Grad vorheizen', 'backofen'), 'required');
  assert.equal(level('Preheat the oven to 180C', 'backofen'), 'required');
});

test('immersion blender is not mistaken for a stand mixer', () => {
  assert.equal(level('use an immersion blender', 'standmixer'), undefined);
  assert.equal(level('Im Standmixer cremig mixen', 'standmixer'), 'required');
});

test('action words alone are only mentioned', () => {
  assert.equal(level('Die Suppe pürieren', 'stabmixer'), 'mentioned');
});

test('no device in plain text', () => {
  assert.deepEqual(detectDevices('mit einem Löffel verrühren'), []);
  assert.deepEqual(detectDevices(''), []);
});

test('words that merely contain a device name do not match', () => {
  assert.equal(level('Kachelofen und Ofenkartoffeln', 'backofen'), undefined);
  assert.equal(level('Grillgewürz', 'grill'), undefined);
});

test('verdict blocks only when a required device is missing', () => {
  const text = 'Mit dem Thermomix pürieren';
  const detected = detectDevices(text);
  const without = deviceVerdict(detected, [], [], text);
  assert.equal(without.blocked, true);
  assert.deepEqual(without.missingDevices, ['thermomix']);
  const withIt = deviceVerdict(detected, ['thermomix'], [], text);
  assert.equal(withIt.blocked, false);
  assert.ok(withIt.bonus > 0);
});

test('mentioned-only device never blocks', () => {
  const text = 'Die Suppe pürieren';
  const v = deviceVerdict(detectDevices(text), [], [], text);
  assert.equal(v.blocked, false);
});

test('custom devices only add bonus', () => {
  const text = 'Mit dem Zauberstab pürieren';
  const v = deviceVerdict(detectDevices(text), [], ['Zauberstab'], text);
  assert.equal(v.blocked, false);
  assert.ok(v.bonus > 0);
  const other = deviceVerdict(detectDevices(text), [], ['Raclette'], text);
  assert.equal(other.bonus, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeSettings, changeSetting } from '../settings.js';

test('saved settings preserve valid values and reject unknown or malformed values', () => {
  assert.deepEqual(normalizeSettings(null), defaults);
  assert.equal(normalizeSettings({badge:'transfer',mime:false}).badge, 'transfer');
  assert.equal(normalizeSettings({badge:'invalid',mime:'false'}).mime, true);
  assert.equal(normalizeSettings({badge:'invalid'}).badge, 'file');
  assert.throws(() => changeSetting(defaults, '__proto__', true));
  assert.throws(() => changeSetting(defaults, 'mime', 'false'));
  assert.throws(() => changeSetting(defaults, 'badge', 'invalid'));
  assert.equal(changeSetting(defaults, 'mime', false).mime, false);
  assert.equal(defaults.mime, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from '../src/taxonomy.ts';

test('涵蓋 13 個有商品的燈具子類（已排除 0 件的 58、65）', () => {
  assert.equal(LIGHT_CATEGORIES.length, 13);
  const ids = LIGHT_CATEGORIES.map(c => c.legacyId).sort((a, b) => a - b);
  assert.deepEqual(ids, [42, 43, 44, 45, 46, 47, 50, 54, 55, 57, 60, 62, 63]);
});

test('軌道燈下的底線命名已正名', () => {
  const box = LIGHT_CATEGORIES.find(c => c.legacyId === 50)!;
  assert.equal(box.legacyName, '盒_燈');
  assert.equal(box.name, '盒燈');
  assert.equal(box.parentSlug, 'track');
  const module = LIGHT_CATEGORIES.find(c => c.legacyId === 60)!;
  assert.equal(module.name, '模組式');
  assert.equal(module.parentSlug, 'track');
});

test('slug 在同一父層下唯一', () => {
  const pairs = LIGHT_CATEGORIES.map(c => `${c.parentSlug}/${c.slug}`);
  assert.equal(new Set(pairs).size, pairs.length);
});

test('涵蓋 5 個開關子類並標註系列與類型', () => {
  assert.equal(SWITCH_CATEGORIES.length, 5);
  const unicaPanel = SWITCH_CATEGORIES.find(c => c.legacyId === 597)!;
  assert.equal(unicaPanel.series, 'unica');
  assert.equal(unicaPanel.type, 'panel');
  const zencelSocket = SWITCH_CATEGORIES.find(c => c.legacyId === 582)!;
  assert.equal(zencelSocket.series, 'zencelo');
  assert.equal(zencelSocket.type, 'socket');
});

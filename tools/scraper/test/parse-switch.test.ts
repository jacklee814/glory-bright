import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSwitchList } from '../src/parse-switch.ts';
import { SWITCH_CATEGORIES } from '../src/taxonomy.ts';
import { modelSlug } from '@glory-bright/shared/slug';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (legacyId: number, page = 1) => readFileSync(join(root, 'snapshot', 'pages', `goods-id${legacyId}-actgoods-page${page}.html`), 'utf8');
const category = (legacyId: number) => SWITCH_CATEGORIES.find(item => item.legacyId === legacyId)!;
const parse = (legacyId: number, page = 1) => parseSwitchList(load(legacyId, page), category(legacyId));

test('UNICA 開關沿用檔名的施耐德料號（id=578）', () => {
  const records = parse(578);
  assert.equal(records.length, 6);
  const first = records[0];
  assert.equal(first.model, '010102');
  assert.equal(first.series, 'unica');
  assert.equal(first.type, 'switch');
  assert.deepEqual(first.images, ['010102.JPG']);
  assert.ok(first.description.includes('純銅色 金屬 三切開關'));
});

test('售價不進入 description', () => {
  for (const record of parse(578)) {
    assert.ok(record.description.every(line => !line.includes('售價')), `售價不得保留：${record.model}`);
    assert.ok(record.description.every(line => !/^\d+$/.test(line)), `純數字行應已被濾除：${record.model}`);
  }
});

test('ZENcelo 檔名是流水號，改用系列前綴編號（id=581）', () => {
  const records = parse(581);
  assert.ok(records.length > 0);
  assert.ok(records.every(record => record.model.startsWith('ZENCELO-SW-')), records.map(r => r.model).join(','));
  assert.equal(records[0].model, 'ZENCELO-SW-01');
  assert.ok(records[0].description.includes('埋入式單開三路開關'));
});

test('ZENcelo 插座使用不同前綴，避免與開關編號衝突（id=582）', () => {
  const records = parse(582);
  assert.ok(records.every(record => record.model.startsWith('ZENCELO-SO-')));
  assert.ok(records.every(record => record.series === 'zencelo' && record.type === 'socket'));
});

test('UNICA 歐規面板取檔名中的色碼（id=597）', () => {
  const records = parse(597);
  assert.equal(records.length, 8);
  assert.ok(records.some(record => record.model === 'UNICA-EP-WG'), records.map(r => r.model).join(','));
  assert.ok(records.some(record => record.description.some(line => line.includes('水綠色'))));
});

test('無色碼的「玻璃黑」仍取得可用型號（id=597）', () => {
  const records = parse(597);
  const glass = records.find(record => record.images[0].startsWith('玻璃黑'));
  assert.ok(glass, '應解析出玻璃黑那一件');
  assert.ok(modelSlug(glass.model).length > 0, `型號 ${glass.model} 的 slug 不得為空`);
});

test('全部開關型號皆為 ASCII 且 slug 唯一', () => {
  const all = SWITCH_CATEGORIES.flatMap(cat => {
    const records = [];
    for (let page = 1; ; page++) {
      try { records.push(...parseSwitchList(load(cat.legacyId, page), cat)); } catch { break; }
    }
    return records;
  });
  assert.equal(all.length, 57);
  for (const record of all) {
    assert.match(record.model, /^[A-Za-z0-9._-]+$/, `型號須為 ASCII：${record.model}`);
    assert.ok(modelSlug(record.model).length > 0, `slug 不得為空：${record.model}`);
  }
  const slugs = all.map(record => modelSlug(record.model));
  assert.equal(new Set(slugs).size, slugs.length, '型號 slug 須全站唯一');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSwitchList } from '../src/parse-switch.ts';
import { SWITCH_CATEGORIES } from '../src/taxonomy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (legacyId: number, page = 1) => join(root, 'snapshot', 'pages', `goods-id${legacyId}-actgoods-page${page}.html`);
const load = (legacyId: number, page = 1) => readFileSync(fixture(legacyId, page), 'utf8');
const category = (legacyId: number) => SWITCH_CATEGORIES.find(item => item.legacyId === legacyId)!;

test('解析 UNICA 開關列表（id=578）', () => {
  const records = parseSwitchList(load(578), category(578));
  assert.equal(records.length, 6);
  const first = records[0];
  assert.equal(first.model, '010102');
  assert.equal(first.series, 'unica');
  assert.equal(first.type, 'switch');
  assert.deepEqual(first.images, ['010102.JPG']);
  assert.ok(first.description.includes('純銅色 金屬 三切開關'));
  assert.ok(first.description.includes('三路對切'));
});

test('售價不進入 description', () => {
  const records = parseSwitchList(load(578), category(578));
  for (const record of records) {
    assert.ok(record.description.every(line => !line.includes('售價')), `售價不得保留：${record.model}`);
    assert.ok(record.description.every(line => !/^\d+$/.test(line)), `純數字行應已被濾除：${record.model}`);
  }
});

test('型號在同一分類內唯一', () => {
  const records = parseSwitchList(load(578), category(578));
  assert.equal(new Set(records.map(record => record.model)).size, records.length);
});

// fixture 需等舊站 IP 封鎖解除、完整 crawl 後才存在。
test('ZENcelo 插座標註正確系列與類型（id=582）', { skip: existsSync(fixture(582)) ? false : 'snapshot 尚未包含此頁，待完整 crawl 後啟用' }, () => {
  const records = parseSwitchList(load(582), category(582));
  assert.ok(records.length > 0);
  assert.ok(records.every(record => record.series === 'zencelo' && record.type === 'socket'));
});

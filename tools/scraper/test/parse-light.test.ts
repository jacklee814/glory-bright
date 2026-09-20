import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLightDetail, parseNumberList } from '../src/parse-light.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (legacyId: number) => join(root, 'snapshot', 'pages', `goods_light_list-id${legacyId}.html`);
const load = (legacyId: number) => readFileSync(fixture(legacyId), 'utf8');

test('parseNumberList 處理多種分隔符', () => {
  assert.deepEqual(parseNumberList('20°/40°/60°'), [20, 40, 60]);
  assert.deepEqual(parseNumberList('3000K、4000K'), [3000, 4000]);
  assert.deepEqual(parseNumberList('120'), [120]);
  assert.deepEqual(parseNumberList(''), []);
});

test('解析完整規格的崁燈（id=120）', () => {
  const record = parseLightDetail(load(120), 120);
  assert.equal(record.model, 'GB-DMR-2060-1');
  assert.equal(record.watt, 9);
  assert.deepEqual(record.beamAngle, [20, 40, 60]);
  assert.deepEqual(record.cct, [3000, 4000]);
  assert.equal(record.cri, 90);
  assert.equal(record.cutoutDia, 60);
  assert.equal(record.voltage, 'AC100V-240V');
  assert.deepEqual(record.colors, ['白', '黑']);
  assert.ok(record.dimensions?.includes('70'));
  assert.ok(record.images.length >= 1);
  assert.deepEqual(record.unknownLabels, []);
});

// 以下 fixture 需等舊站 IP 封鎖解除、完整 crawl 後才存在。
// 屆時這些測試會自動啟用；在此之前以 skip 明示尚未驗證，而非假裝通過。
const variants: [number, string, (record: ReturnType<typeof parseLightDetail>) => void][] = [
  [130, '使用「輸 入 電 壓」變體的產品', record => {
    assert.ok(record.voltage, '輸入電壓應被解析到 voltage');
    assert.ok(record.model.length > 0);
  }],
  [238, '無任何規格欄位的產品不丟例外', record => {
    assert.equal(record.watt, undefined);
    assert.equal(record.legacyId, 238);
    assert.ok(record.images.length >= 1, '至少要有主圖');
  }],
  [191, '以燈座取代功率的產品', record => {
    assert.equal(record.watt, undefined);
    assert.ok(record.socket, '燈座欄位應被解析');
    assert.deepEqual(record.unknownLabels, []);
  }],
];

for (const [legacyId, name, check] of variants) {
  test(`${name}（id=${legacyId}）`, { skip: existsSync(fixture(legacyId)) ? false : 'snapshot 尚未包含此頁，待完整 crawl 後啟用' }, () => {
    check(parseLightDetail(load(legacyId), legacyId));
  });
}

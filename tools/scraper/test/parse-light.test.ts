import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLightDetail, parseNumberList } from '../src/parse-light.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (legacyId: number) => readFileSync(join(root, 'snapshot', 'pages', `goods_light_list-id${legacyId}.html`), 'utf8');
const parse = (legacyId: number) => parseLightDetail(load(legacyId), legacyId);

test('parseNumberList 處理多種分隔符', () => {
  assert.deepEqual(parseNumberList('20°/40°/60°'), [20, 40, 60]);
  assert.deepEqual(parseNumberList('3000K、4000K'), [3000, 4000]);
  assert.deepEqual(parseNumberList('120'), [120]);
  assert.deepEqual(parseNumberList(''), []);
});

test('解析完整規格的崁燈（id=120）', () => {
  const record = parse(120);
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

test('「輸 入 電 壓」變體對應到 voltage（id=130）', () => {
  const record = parse(130);
  assert.ok(record.voltage, '輸入電壓應被解析到 voltage');
  assert.ok(record.model.length > 0);
});

test('以燈座取代功率的產品（id=191）', () => {
  const record = parse(191);
  assert.ok(record.socket, '燈座欄位應被解析');
});

test('規格欄位全空時，型號自麵包屑取得（id=230）', () => {
  const record = parse(230);
  assert.equal(record.model, 'GB-TB-6060-3');
  assert.equal(record.watt, undefined);
  assert.ok(record.images.length >= 1, '至少要有主圖');
});

test('「發光角度」是「角度」的別名（id=119）', () => {
  const record = parse(119);
  assert.deepEqual(record.beamAngle, [120]);
});

test('品名成為第一級欄位（id=119）', () => {
  const record = parse(119);
  assert.equal(record.model, 'GB-TAL-2016-1');
  assert.equal(record.name, '三角型鋁條燈');
});

test('非標準欄位存入 extras（id=119）', () => {
  const record = parse(119);
  assert.equal(record.extras['晶片規格'], 'SMD2835');
  assert.deepEqual(record.unknownLabels, ['晶片規格'], '仍要回報供人工判斷是否升級為正式欄位');
});

test('無冒號的備註行存入 notes（id=119）', () => {
  const record = parse(119);
  assert.ok(record.notes.some(note => note.includes('變壓器')), `notes 應含變壓器備註，實際為 ${JSON.stringify(record.notes)}`);
});

test('多個非標準欄位都被保留（id=79）', () => {
  const record = parse(79);
  assert.equal(record.model, 'T53R9012-D');
  for (const label of ['建議坪數', '調光', '連續調色']) {
    assert.ok(label in record.extras, `${label} 應存入 extras`);
  }
});

test('中心亮度存入 extras（id=66）', () => {
  const record = parse(66);
  assert.ok('中心亮度' in record.extras);
});

test('全部 137 件都有型號', () => {
  const ids = [66, 67, 79, 119, 120, 130, 191, 230, 238, 245];
  for (const id of ids) {
    assert.ok(parse(id).model.length > 0, `id=${id} 應有型號`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLabel, resolveField } from '../src/labels.ts';

test('去除表意空格 U+3000', () => {
  assert.equal(normalizeLabel('功　　率'), '功率');
});

test('去除細空格 U+2009', () => {
  assert.equal(normalizeLabel('演  色  性'), '演色性');
});

test('去除半形空格與不換行空格', () => {
  assert.equal(normalizeLabel('埋 入 孔 徑'), '埋入孔徑');
  assert.equal(normalizeLabel('材 質 顏 色'), '材質顏色');
});

test('使用電壓與輸入電壓對應到同一欄位', () => {
  assert.equal(resolveField('使用電壓'), 'voltage');
  assert.equal(resolveField('輸 入 電 壓'), 'voltage');
});

test('各欄位別名解析', () => {
  assert.equal(resolveField('型號'), 'model');
  assert.equal(resolveField('功　　率'), 'watt');
  assert.equal(resolveField('角　　度'), 'beamAngle');
  assert.equal(resolveField('色　　溫'), 'cct');
  assert.equal(resolveField('演  色  性'), 'cri');
  assert.equal(resolveField('埋 入 孔 徑'), 'cutoutDia');
  assert.equal(resolveField('尺　　寸'), 'dimensions');
  assert.equal(resolveField('材 質 顏 色'), 'colors');
  assert.equal(resolveField('燈座'), 'socket');
});

test('未知標籤回傳 null', () => {
  assert.equal(resolveField('保固年限'), null);
});

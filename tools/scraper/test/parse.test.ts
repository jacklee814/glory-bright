import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../src/report.ts';

test('報告列出無規格產品', () => {
  const report = buildReport({
    lights: [{ legacyId: 238, model: '', beamAngle: [], cct: [], colors: [], images: ['a.png'], unknownLabels: [], categoryLegacyId: 42 }],
    switches: [], missingImages: [],
  });
  assert.match(report, /238/);
  assert.match(report, /無規格|缺少型號/);
});

test('報告列出重複型號', () => {
  const base = { series: 'unica' as const, type: 'switch' as const, description: [], images: ['x.JPG'], legacyCategoryId: 578 };
  const report = buildReport({ lights: [], switches: [{ ...base, model: '010102' }, { ...base, model: '010102' }], missingImages: [] });
  assert.match(report, /重複型號/);
  assert.match(report, /010102/);
});

test('報告列出未知標籤', () => {
  const report = buildReport({
    lights: [{ legacyId: 500, model: 'GB-X', watt: 9, beamAngle: [], cct: [], colors: [], images: ['a.png'], unknownLabels: ['保固年限'], categoryLegacyId: 42 }],
    switches: [], missingImages: [],
  });
  assert.match(report, /保固年限/);
});

test('報告列出 snapshot 缺少的圖檔', () => {
  const report = buildReport({ lights: [], switches: [], missingImages: ['圖片三.png'] });
  assert.match(report, /缺少的圖檔/);
  assert.match(report, /圖片三\.png/);
});

test('完全乾淨的資料產生無待辦的報告', () => {
  const report = buildReport({
    lights: [{ legacyId: 120, model: 'GB-DMR-2060-1', watt: 9, beamAngle: [20], cct: [3000], colors: ['白'], images: ['a.png'], unknownLabels: [], categoryLegacyId: 42 }],
    switches: [], missingImages: [],
  });
  assert.match(report, /無待處理項目/);
});

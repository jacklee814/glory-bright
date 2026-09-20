import type { LightRecord } from './parse-light.ts';
import type { SwitchRecord } from './parse-switch.ts';

export type LightRow = LightRecord & { categoryLegacyId: number };

export interface ReportInput { lights: LightRow[]; switches: SwitchRecord[]; missingImages: string[] }

/** 人工驗收清單。舊站資料有缺漏是常態，報告負責攤開讓業主補，而不是讓 pipeline 靜默通過。 */
export function buildReport(input: ReportInput): string {
  const header = [
    '# 舊站資料解析報告', '',
    `產生時間：${new Date().toISOString()}`, '',
    `燈具 ${input.lights.length} 件、開關 ${input.switches.length} 件。`, '',
  ];
  const sections: string[] = [];

  const noSpec = input.lights.filter(row => !row.model || (row.watt === undefined && row.socket === undefined && row.cct.length === 0));
  if (noSpec.length) sections.push(['## 無規格或缺少型號', '', ...noSpec.map(row => `- legacyId ${row.legacyId}（型號「${row.model || '空白'}」）需人工補齊`), ''].join('\n'));

  const unknown = input.lights.filter(row => row.unknownLabels.length > 0);
  if (unknown.length) sections.push(['## 未知標籤', '', ...unknown.map(row => `- legacyId ${row.legacyId}：${row.unknownLabels.join('、')}`), ''].join('\n'));

  const models = [...input.lights.map(row => row.model), ...input.switches.map(row => row.model)].filter(Boolean);
  const duplicates = [...new Set(models.filter((model, index) => models.indexOf(model) !== index))];
  if (duplicates.length) sections.push(['## 重複型號', '', ...duplicates.map(model => `- ${model}`), ''].join('\n'));

  const noImage = [
    ...input.lights.filter(row => row.images.length === 0).map(row => `legacyId ${row.legacyId}`),
    ...input.switches.filter(row => row.images.length === 0).map(row => row.model),
  ];
  if (noImage.length) sections.push(['## 無圖片', '', ...noImage.map(label => `- ${label}`), ''].join('\n'));

  if (input.missingImages.length) sections.push(['## snapshot 缺少的圖檔', '', ...input.missingImages.map(name => `- ${name}`), ''].join('\n'));

  return [...header, ...(sections.length ? sections : ['無待處理項目。', ''])].join('\n');
}

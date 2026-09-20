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
  const notices: string[] = [];

  const noSpec = input.lights.filter(row => !row.model || (row.watt === undefined && row.socket === undefined && row.cct.length === 0));
  if (noSpec.length) sections.push(['## 無規格或缺少型號', '', ...noSpec.map(row => `- legacyId ${row.legacyId}（型號「${row.model || '空白'}」）需人工補齊`), ''].join('\n'));

  const unknown = input.lights.filter(row => row.unknownLabels.length > 0);
  if (unknown.length) {
    // 這些欄位已原樣存入 extras，不會遺失；列出來是讓人工判斷是否要升級為正式欄位。
    const labels = [...new Set(unknown.flatMap(row => row.unknownLabels))];
    notices.push([
      '## 非標準規格欄位（已保留於 extras）', '',
      `舊站有 ${unknown.length} 件產品使用下列非標準欄位，已原樣存入 \`extras\` 並顯示於產品頁：`, '',
      ...labels.map(label => `- ${label}（${unknown.filter(row => row.unknownLabels.includes(label)).length} 件）`),
      '', '若其中某欄位應成為可篩選的正式規格，請在 `shared/schema.ts` 與 `labels.ts` 補上對應。', '',
    ].join('\n'));
  }

  const models = [...input.lights.map(row => row.model), ...input.switches.map(row => row.model)].filter(Boolean);
  const duplicates = [...new Set(models.filter((model, index) => models.indexOf(model) !== index))];
  if (duplicates.length) sections.push(['## 重複型號', '', ...duplicates.map(model => `- ${model}`), ''].join('\n'));

  const noImage = [
    ...input.lights.filter(row => row.images.length === 0).map(row => `legacyId ${row.legacyId}`),
    ...input.switches.filter(row => row.images.length === 0).map(row => row.model),
  ];
  if (noImage.length) sections.push(['## 無圖片', '', ...noImage.map(label => `- ${label}`), ''].join('\n'));

  if (input.missingImages.length) sections.push(['## snapshot 缺少的圖檔', '', ...input.missingImages.map(name => `- ${name}`), ''].join('\n'));

  return [...header, ...(sections.length ? sections : ['無待處理項目。', '']), ...notices].join('\n');
}

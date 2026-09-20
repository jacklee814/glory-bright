import * as cheerio from 'cheerio';
import type { LegacySwitchCategory } from './taxonomy.ts';

export interface SwitchRecord {
  model: string; series: 'unica' | 'zencelo'; type: 'switch' | 'socket' | 'panel';
  description: string[]; images: string[]; legacyCategoryId: number;
}

/**
 * 從圖檔名推出型號用的代碼。
 *
 * ZENcelo 的檔名本身就是 ASCII 流水號（`01`、`4SBZ`），直接使用。
 * UNICA 歐規面板是中文顏色名加色碼（`水綠色 WG`），取尾端的 ASCII 色碼；
 * 「玻璃黑」沒有色碼，退回序號以保證型號存在且唯一。
 */
function codeFromFilename(stem: string, index: number): string {
  if (/^[A-Za-z0-9._-]+$/.test(stem)) return stem;
  const trailing = stem.match(/([A-Za-z0-9]+)\s*$/)?.[1];
  return trailing ?? String(index + 1).padStart(2, '0');
}

/** 舊站每個產品是一個 <td id="img_big">，內含圖片與自由格式描述行；售價不遷移。 */
export function parseSwitchList(html: string, category: LegacySwitchCategory): SwitchRecord[] {
  const $ = cheerio.load(html);
  const records: SwitchRecord[] = [];
  const seen = new Set<string>();

  for (const cell of $('td#img_big').toArray()) {
    const node = $(cell);
    const source = node.find('img').attr('src');
    if (!source?.includes('goods_img/')) continue;
    const file = decodeURIComponent(source.replace(/^(\.\.\/)+/, '').split('/').at(-1)!);
    const stem = file.replace(/\.[^.]+$/, '').trim();
    if (!stem) continue;

    const model = category.filenameIsPartCode
      ? stem
      : `${category.codePrefix}-${codeFromFilename(stem, records.length)}`;
    if (seen.has(model)) continue;
    seen.add(model);

    const description = node.html()!
      .split(/<br\s*\/?>/i).slice(1)
      .map(part => cheerio.load(`<div>${part}</div>`)('div').text())
      .map(line => line.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0 && !line.includes('售價') && !/^\d+$/.test(line));

    records.push({ model, series: category.series, type: category.type, description, images: [file], legacyCategoryId: category.legacyId });
  }
  return records;
}

import * as cheerio from 'cheerio';
import type { LegacySwitchCategory } from './taxonomy.ts';

export interface SwitchRecord {
  model: string; series: 'unica' | 'zencelo'; type: 'switch' | 'socket' | 'panel';
  description: string[]; images: string[]; legacyCategoryId: number;
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
    const model = file.replace(/\.[^.]+$/, '').trim();
    if (!model || seen.has(model)) continue;
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

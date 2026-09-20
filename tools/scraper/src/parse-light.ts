import * as cheerio from 'cheerio';
import { resolveField, normalizeLabel } from './labels.ts';

export interface LightRecord {
  legacyId: number; model: string; name?: string;
  watt?: number; beamAngle: number[]; cct: number[]; cri?: number; cutoutDia?: number;
  dimensions?: string; voltage?: string; colors: string[]; socket?: string;
  /** 舊站有少數非標準欄位（晶片規格、中心亮度等），原樣保留而不丟棄。 */
  extras: Record<string, string>;
  /** 規格區塊中沒有標籤的說明行，例如「※ 變壓器，另計」。 */
  notes: string[];
  images: string[]; unknownLabels: string[];
}

export function parseNumberList(raw: string): number[] {
  return [...raw.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
}

const firstNumber = (raw: string) => parseNumberList(raw)[0];

/** 麵包屑最後一段是型號。舊站有 17 件產品的「型號」欄位是空的，只剩麵包屑帶著型號。 */
function modelFromBreadcrumb(html: string): string {
  return html.match(/->([^<>]+)<\/span>/)?.[1].trim() ?? '';
}

export function parseLightDetail(html: string, legacyId: number): LightRecord {
  const $ = cheerio.load(html);
  const record: LightRecord = {
    legacyId, model: '', beamAngle: [], cct: [], colors: [],
    extras: {}, notes: [], images: [], unknownLabels: [],
  };

  for (const element of $('.light_list_left, .light_list_right').find('img').toArray()) {
    const source = $(element).attr('src');
    if (source?.includes('goods_light_img/')) {
      const name = decodeURIComponent(source.replace(/^(\.\.\/)+/, '').split('/').at(-1)!);
      if (!record.images.includes(name)) record.images.push(name);
    }
  }

  for (const element of $('.light_list_left div').toArray()) {
    const text = $(element).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const separator = text.search(/[：:]/);
    if (separator < 0) { if (!record.notes.includes(text)) record.notes.push(text); continue; }
    const rawLabel = text.slice(0, separator);
    const value = text.slice(separator + 1).trim();
    const label = normalizeLabel(rawLabel);
    if (!label || !value) continue;
    const field = resolveField(rawLabel);
    if (!field) {
      record.extras[label] = value;
      if (!record.unknownLabels.includes(label)) record.unknownLabels.push(label);
      continue;
    }
    switch (field) {
      case 'model': record.model = value; break;
      case 'name': record.name = value; break;
      case 'watt': record.watt = firstNumber(value); break;
      case 'beamAngle': record.beamAngle = parseNumberList(value); break;
      case 'cct': record.cct = parseNumberList(value); break;
      case 'cri': record.cri = firstNumber(value); break;
      case 'cutoutDia': record.cutoutDia = firstNumber(value); break;
      case 'dimensions': record.dimensions = value; break;
      case 'voltage': record.voltage = value; break;
      case 'colors': record.colors = value.split(/[、,／/]/).map(part => part.trim()).filter(Boolean); break;
      case 'socket': record.socket = value; break;
    }
  }

  if (!record.model) record.model = modelFromBreadcrumb(html);
  return record;
}

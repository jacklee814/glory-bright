import * as cheerio from 'cheerio';
import { resolveField, normalizeLabel } from './labels.ts';

export interface LightRecord {
  legacyId: number; model: string;
  watt?: number; beamAngle: number[]; cct: number[]; cri?: number; cutoutDia?: number;
  dimensions?: string; voltage?: string; colors: string[]; socket?: string;
  images: string[]; unknownLabels: string[];
}

export function parseNumberList(raw: string): number[] {
  return [...raw.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
}

const firstNumber = (raw: string) => parseNumberList(raw)[0];

export function parseLightDetail(html: string, legacyId: number): LightRecord {
  const $ = cheerio.load(html);
  const record: LightRecord = { legacyId, model: '', beamAngle: [], cct: [], colors: [], images: [], unknownLabels: [] };

  for (const element of $('.light_list_left, .light_list_right').find('img').toArray()) {
    const source = $(element).attr('src');
    if (source?.includes('goods_light_img/')) {
      const name = decodeURIComponent(source.replace(/^(\.\.\/)+/, '').split('/').at(-1)!);
      if (!record.images.includes(name)) record.images.push(name);
    }
  }

  for (const element of $('.light_list_left div').toArray()) {
    const text = $(element).text().replace(/ /g, ' ').trim();
    const separator = text.search(/[：:]/);
    if (separator < 0) continue;
    const rawLabel = text.slice(0, separator);
    const value = text.slice(separator + 1).trim();
    if (!normalizeLabel(rawLabel) || !value) continue;
    const field = resolveField(rawLabel);
    if (!field) {
      const label = normalizeLabel(rawLabel);
      if (!record.unknownLabels.includes(label)) record.unknownLabels.push(label);
      continue;
    }
    switch (field) {
      case 'model': record.model = value; break;
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
  return record;
}

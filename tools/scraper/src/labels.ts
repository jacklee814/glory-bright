export type LightField = 'model' | 'name' | 'watt' | 'beamAngle' | 'cct' | 'cri' | 'cutoutDia' | 'dimensions' | 'voltage' | 'colors' | 'socket';

/** 舊站標籤夾雜 U+3000、U+2009、U+00A0 與半形空格作為排版填充，比對前全部去除。 */
export function normalizeLabel(raw: string): string {
  return raw.replace(/[\s  -​　]/gu, '');
}

const ALIASES: Record<string, LightField> = {
  型號: 'model',
  品名: 'name',
  功率: 'watt',
  角度: 'beamAngle',
  發光角度: 'beamAngle',
  色溫: 'cct',
  演色性: 'cri',
  埋入孔徑: 'cutoutDia',
  開孔尺寸: 'cutoutDia',
  尺寸: 'dimensions',
  使用電壓: 'voltage',
  輸入電壓: 'voltage',
  材質顏色: 'colors',
  燈座: 'socket',
};

export function resolveField(rawLabel: string): LightField | null {
  return ALIASES[normalizeLabel(rawLabel)] ?? null;
}

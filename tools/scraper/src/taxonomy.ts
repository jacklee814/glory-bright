export interface LegacyLightCategory {
  legacyId: number; legacyName: string;
  parentSlug: string; parentName: string; parentOrder: number;
  slug: string; name: string; order: number;
}
export interface LegacySwitchCategory {
  legacyId: number; series: 'unica' | 'zencelo'; type: 'switch' | 'socket' | 'panel';
  slug: string; name: string; order: number;
}

/** 舊站 goods_light.php?id=<legacyId>。已排除 0 件的 58（懸吊式）與 65（1121321 測試資料）。 */
export const LIGHT_CATEGORIES: LegacyLightCategory[] = [
  { legacyId: 42, legacyName: 'MR16型',     parentSlug: 'downlight', parentName: '崁燈',       parentOrder: 1, slug: 'mr16',    name: 'MR16型',     order: 1 },
  { legacyId: 44, legacyName: 'AR111型',    parentSlug: 'downlight', parentName: '崁燈',       parentOrder: 1, slug: 'ar111',   name: 'AR111型',    order: 2 },
  { legacyId: 45, legacyName: '泛光型',     parentSlug: 'downlight', parentName: '崁燈',       parentOrder: 1, slug: 'flood',   name: '泛光型',     order: 3 },
  { legacyId: 47, legacyName: '盒燈',       parentSlug: 'downlight', parentName: '崁燈',       parentOrder: 1, slug: 'box',     name: '盒燈',       order: 4 },
  { legacyId: 55, legacyName: '模組式',     parentSlug: 'downlight', parentName: '崁燈',       parentOrder: 1, slug: 'module',  name: '模組式',     order: 5 },
  { legacyId: 43, legacyName: 'MR_AR型',    parentSlug: 'track',     parentName: '軌道燈',     parentOrder: 2, slug: 'mr-ar',   name: 'MR/AR型',    order: 1 },
  { legacyId: 50, legacyName: '盒_燈',      parentSlug: 'track',     parentName: '軌道燈',     parentOrder: 2, slug: 'box',     name: '盒燈',       order: 2 },
  { legacyId: 60, legacyName: '模組式_',    parentSlug: 'track',     parentName: '軌道燈',     parentOrder: 2, slug: 'module',  name: '模組式',     order: 3 },
  { legacyId: 46, legacyName: '吸頂式',     parentSlug: 'ceiling',   parentName: '吸頂懸吊燈', parentOrder: 3, slug: 'surface', name: '吸頂式',     order: 1 },
  { legacyId: 54, legacyName: '鋁條燈',     parentSlug: 'linear',    parentName: '線型燈',     parentOrder: 4, slug: 'alu-bar', name: '鋁條燈',     order: 1 },
  { legacyId: 57, legacyName: '軟帶燈',     parentSlug: 'linear',    parentName: '線型燈',     parentOrder: 4, slug: 'strip',   name: '軟帶燈',     order: 2 },
  { legacyId: 62, legacyName: '辦公室照明', parentSlug: 'office',    parentName: '辦公工程照明', parentOrder: 5, slug: 'indoor',  name: '辦公室照明', order: 1 },
  { legacyId: 63, legacyName: '工程照明',   parentSlug: 'office',    parentName: '辦公工程照明', parentOrder: 5, slug: 'project', name: '工程照明',   order: 2 },
];

/** 舊站 goods.php?id=<legacyId>。開關無明細頁，資料全在列表頁。 */
export const SWITCH_CATEGORIES: LegacySwitchCategory[] = [
  { legacyId: 578, series: 'unica',   type: 'switch', slug: 'switch',     name: 'UNICA 開關',     order: 1 },
  { legacyId: 579, series: 'unica',   type: 'socket', slug: 'socket',     name: 'UNICA 插座',     order: 2 },
  { legacyId: 597, series: 'unica',   type: 'panel',  slug: 'euro-panel', name: 'UNICA 歐規面板', order: 3 },
  { legacyId: 581, series: 'zencelo', type: 'switch', slug: 'switch',     name: 'ZENcelo 開關',   order: 1 },
  { legacyId: 582, series: 'zencelo', type: 'socket', slug: 'socket',     name: 'ZENcelo 插座',   order: 2 },
];

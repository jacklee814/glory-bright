import * as cheerio from 'cheerio';

/**
 * 舊站的分類封面圖。
 *
 * 三個來源各對應一層分類：
 * - `category.php`：燈具第一層（崁燈、軌道燈…），連結帶中文分類名
 * - `category_light1.php?id=<中文>`：燈具第二層（MR16型、AR111型…），連結帶 goods_light.php 的 legacyId
 * - `category_switch.php`：開關葉節點（UNICA 開關、ZENcelo 插座…），連結帶 goods.php 的 legacyId
 */
export interface CoverSource { html: string; kind: 'lightTop' | 'lightLeaf' | 'switchLeaf' }

const fileOf = (source: string) => decodeURIComponent(source.replace(/^(\.\.\/)+/, '').split('/').at(-1)!);

/** 燈具第一層：key 為舊站中文分類名（如「崁燈」）。 */
export function parseLightTopCovers(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const covers = new Map<string, string>();
  for (const anchor of $('a[href*="category_light1.php"]').toArray()) {
    const image = $(anchor).find('img[src*="category_light_img/"]').attr('src');
    const name = decodeURIComponent($(anchor).attr('href')!.match(/id=([^&]+)/)?.[1] ?? '');
    if (image && name && !covers.has(name)) covers.set(name, fileOf(image));
  }
  return covers;
}

/** 燈具第二層與開關葉節點：key 為 legacyId。 */
export function parseLeafCovers(html: string, listPage: 'goods_light.php' | 'goods.php'): Map<number, string> {
  const $ = cheerio.load(html);
  const covers = new Map<number, string>();
  const pattern = listPage.replace('.', '\\.');
  for (const anchor of $(`a[href*="${listPage}"]`).toArray()) {
    const image = $(anchor).find('img[src*="category"]').attr('src');
    const id = Number($(anchor).attr('href')!.match(new RegExp(`${pattern}\\?id=(\\d+)`))?.[1]);
    if (image && Number.isFinite(id) && !covers.has(id)) covers.set(id, fileOf(image));
  }
  return covers;
}

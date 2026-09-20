export const BASE = 'http://www.glory-bright.com.tw/';

export const lightListUrl = (legacyId: number, page: number) => `${BASE}goods_light.php?id=${legacyId}&act=goods&page=${page}`;
export const switchListUrl = (legacyId: number, page: number) => `${BASE}goods.php?id=${legacyId}&act=goods&page=${page}`;
export const lightDetailUrl = (legacyId: number) => `${BASE}goods_light_list.php?id=${legacyId}`;

/** URL → 穩定且唯一的 ASCII 檔名，供 snapshot 落檔使用。 */
export function snapshotName(url: string): string {
  const { pathname, searchParams } = new URL(url);
  const stem = pathname.replace(/^\//, '').replace(/\.php$/, '') || 'index';
  const query = [...searchParams].map(([key, value]) => `${key}${value}`).join('-');
  return [stem, query].filter(Boolean).join('-').replace(/[^A-Za-z0-9._-]+/g, '-');
}

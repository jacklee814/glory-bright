export const BASE = 'http://www.glory-bright.com.tw/';

export const lightListUrl = (legacyId: number, page: number) => `${BASE}goods_light.php?id=${legacyId}&act=goods&page=${page}`;
export const switchListUrl = (legacyId: number, page: number) => `${BASE}goods.php?id=${legacyId}&act=goods&page=${page}`;
export const lightDetailUrl = (legacyId: number) => `${BASE}goods_light_list.php?id=${legacyId}`;
/** 燈具第二層分類頁，id 是舊站的中文分類名。 */
export const lightSubCategoryUrl = (legacyName: string) => `${BASE}category_light1.php?id=${encodeURIComponent(legacyName)}&act=goods`;

/**
 * URL → 穩定且唯一的 ASCII 檔名，供 snapshot 落檔使用。
 *
 * 查詢參數可能含中文（`category_light1.php?id=崁燈`）。單純把非 ASCII 換成 `-` 會讓
 * 不同分類的頁面共用同一個檔名而互相覆蓋，因此只要發生替換就附加 URL 的短雜湊。
 */
export function snapshotName(url: string): string {
  const { pathname, searchParams } = new URL(url);
  const stem = pathname.replace(/^\//, '').replace(/\.php$/, '') || 'index';
  const query = [...searchParams].map(([key, value]) => `${key}${value}`).join('-');
  const raw = [stem, query].filter(Boolean).join('-');
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, '-');
  return safe === raw ? safe : `${safe}-${shortHash(url)}`;
}

/** FNV-1a 32-bit，只用於產生穩定的檔名後綴。 */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

import { getCollection } from 'astro:content';
import { siteUrl } from './url';

/** 隱藏草稿，並依日期由新到舊排序。 */
export const newsEntries = async () =>
  (await getCollection('news', ({ data }) => data.draft !== true))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

/** 依需求以 年/月/日 呈現，固定補零讓列表對齊。 */
export function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** 檔名帶日期前綴（2026-09-15-website-launch），網址只取後面的 slug。 */
export const newsSlug = (id: string) => id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
export const newsUrl = (id: string) => siteUrl(`/news/${newsSlug(id)}/`);

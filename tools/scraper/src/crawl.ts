import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchText, fetchBinary, InterceptError } from './http.ts';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { HERO_IMAGES } from './hero.ts';
import { BASE, snapshotName, lightListUrl, switchListUrl, lightDetailUrl, lightSubCategoryUrl } from './urls.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = join(root, 'snapshot');
const force = process.argv.includes('--force');

interface Manifest { fetchedAt: string; pages: Record<string, string>; images: Record<string, string>; failures: string[] }

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }

async function loadManifest(): Promise<Manifest> {
  const path = join(snapshot, 'manifest.json');
  if (await exists(path)) return JSON.parse(await readFile(path, 'utf8')) as Manifest;
  return { fetchedAt: new Date().toISOString(), pages: {}, images: {}, failures: [] };
}

const manifest = await loadManifest();

if (Object.keys(manifest.pages).length > 0 && !force) {
  console.log(`snapshot 已存在（${Object.keys(manifest.pages).length} 頁）。續抓缺漏項目；要整批重抓請加 --force。`);
}

async function save() {
  await mkdir(snapshot, { recursive: true });
  await writeFile(join(snapshot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** 已抓過就跳過，讓 crawl 可在被攔截後續跑。 */
async function page(url: string): Promise<string | null> {
  const name = `${snapshotName(url)}.html`;
  const path = join(snapshot, 'pages', name);
  if (manifest.pages[url] && !force && await exists(path)) return readFile(path, 'utf8');
  try {
    const html = await fetchText(url);
    await mkdir(join(snapshot, 'pages'), { recursive: true });
    await writeFile(path, html);
    manifest.pages[url] = `pages/${name}`;
    manifest.failures = manifest.failures.filter(failure => failure !== url);
    await save();
    console.log(`✓ ${url}`);
    return html;
  } catch (error) {
    const reason = error instanceof InterceptError ? '被 HiNet 攔截' : String(error);
    console.error(`✗ ${url} — ${reason}`);
    if (!manifest.failures.includes(url)) manifest.failures.push(url);
    await save();
    if (error instanceof InterceptError) throw error; // 被攔截就停止，避免持續打站
    return null;
  }
}

async function image(relative: string) {
  const clean = relative.replace(/^(\.\.\/)+/, '');
  const url = BASE + clean.split('/').map(encodeURIComponent).join('/');
  const name = decodeURIComponent(clean.split('/').at(-1)!);
  const path = join(snapshot, 'images', name);
  if (manifest.images[url] && await exists(path)) return;
  try {
    const data = await fetchBinary(url);
    await mkdir(join(snapshot, 'images'), { recursive: true });
    await writeFile(path, data);
    manifest.images[url] = `images/${name}`;
    await save();
    console.log(`✓ 圖 ${name}`);
  } catch (error) {
    console.error(`✗ 圖 ${name} — ${error}`);
    if (!manifest.failures.includes(url)) manifest.failures.push(url);
    await save();
  }
}

function lastPage(html: string, pattern: RegExp): number {
  return Math.max(1, ...[...html.matchAll(pattern)].map(match => Number(match[1])));
}

// 靜態頁
for (const path of ['index.php', 'category.php', 'category_light.php', 'category_switch.php', 'news.php', 'news_list.php?id=124', 'contact_us.php']) {
  await page(BASE + path);
}

// 首頁輪播圖
for (const hero of HERO_IMAGES) await image(`images/${hero.file}`);

// 分類封面圖：第一層來自 category.php／category_switch.php，第二層來自 category_light1.php
const coverPages = [await page(BASE + 'category.php'), await page(BASE + 'category_switch.php')];
for (const legacyName of [...new Set(LIGHT_CATEGORIES.map(category => category.parentLegacyName))]) {
  coverPages.push(await page(lightSubCategoryUrl(legacyName)));
}
for (const html of coverPages) {
  if (!html) continue;
  const $ = cheerio.load(html);
  for (const element of $('img').toArray()) {
    const source = $(element).attr('src');
    if (source?.includes('category_light_img/') || source?.includes('category_img/')) await image(source);
  }
}

// 燈具：列表 → 明細
const detailIds = new Set<number>();
for (const category of LIGHT_CATEGORIES) {
  const first = await page(lightListUrl(category.legacyId, 1));
  if (!first) continue;
  const pages = lastPage(first, new RegExp(`goods_light\\.php\\?id=${category.legacyId}&act=goods&page=(\\d+)`, 'g'));
  for (let index = 1; index <= pages; index++) {
    const html = index === 1 ? first : await page(lightListUrl(category.legacyId, index));
    if (!html) continue;
    for (const match of html.matchAll(/goods_light_list\.php\?id=(\d+)/g)) detailIds.add(Number(match[1]));
  }
}
for (const id of [...detailIds].sort((a, b) => a - b)) {
  const html = await page(lightDetailUrl(id));
  if (!html) continue;
  const $ = cheerio.load(html);
  for (const element of $('img').toArray()) {
    const source = $(element).attr('src');
    if (source?.includes('goods_light_img/')) await image(source);
  }
}

// 開關：只有列表頁
for (const category of SWITCH_CATEGORIES) {
  const first = await page(switchListUrl(category.legacyId, 1));
  if (!first) continue;
  const pages = lastPage(first, new RegExp(`goods\\.php\\?id=${category.legacyId}&act=goods&page=(\\d+)`, 'g'));
  for (let index = 1; index <= pages; index++) {
    const html = index === 1 ? first : await page(switchListUrl(category.legacyId, index));
    if (!html) continue;
    const $ = cheerio.load(html);
    for (const element of $('img').toArray()) {
      const source = $(element).attr('src');
      if (source?.includes('goods_img/')) await image(source);
    }
  }
}

console.log(`\n完成：${Object.keys(manifest.pages).length} 頁、${Object.keys(manifest.images).length} 張圖、${manifest.failures.length} 項失敗`);
if (manifest.failures.length > 0) { console.error('失敗清單：'); manifest.failures.forEach(url => console.error(`  ${url}`)); process.exitCode = 1; }

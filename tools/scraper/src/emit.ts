import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productSchema, categorySchema } from '@glory-bright/shared/schema';
import { modelSlug } from '@glory-bright/shared/slug';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { imageName, toWebp } from './images.ts';
import { HERO_IMAGES } from './hero.ts';
import { parseLightTopCovers, parseLeafCovers } from './covers.ts';
import { snapshotName, lightSubCategoryUrl } from './urls.ts';
import type { LightRow } from './report.ts';
import type { SwitchRecord } from './parse-switch.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const contentRoot = join(repo, 'site', 'src', 'content', 'products');
const publicRoot = join(repo, 'site', 'public', 'products');
const heroRoot = join(repo, 'site', 'public', 'hero');
const coverRoot = join(repo, 'site', 'public', 'categories');
const snapshotImages = join(root, 'snapshot', 'images');

const lights: LightRow[] = JSON.parse(await readFile(join(root, 'data', 'lights.json'), 'utf8'));
const switches: SwitchRecord[] = JSON.parse(await readFile(join(root, 'data', 'switches.json'), 'utf8'));

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
const snapshotPage = async (name: string) => {
  const path = join(root, 'snapshot', 'pages', `${name}.html`);
  return await exists(path) ? readFile(path, 'utf8') : null;
};

// 每次 emit 都從乾淨狀態重建，避免上一輪的殘留產品變成幽靈資料。
for (const dir of [contentRoot, publicRoot, heroRoot, coverRoot]) await rm(dir, { recursive: true, force: true });
for (const dir of [publicRoot, heroRoot, coverRoot]) await mkdir(dir, { recursive: true });

const models = new Set<string>();
const failures: string[] = [];
/** 舊站的規格示意圖跨產品共用，同一來源檔只轉一次並共用路徑。 */
const emittedImages = new Map<string, string>();
/** 分類路徑 → 該分類第一件產品的圖，作為沒有舊站封面時的後備。 */
const firstProductImage = new Map<string, string>();

async function emitImages(model: string, files: string[]): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const reused = emittedImages.get(file);
    if (reused) { if (!written.includes(reused)) written.push(reused); continue; }
    const source = join(snapshotImages, file);
    if (!await exists(source)) { failures.push(`${model}：snapshot 缺少圖檔 ${file}`); continue; }
    const name = imageName(model, written.length);
    try { await toWebp(source, join(publicRoot, name)); }
    catch (error) { failures.push(`${model}：圖檔 ${file} 轉檔失敗 — ${error}`); continue; }
    const path = `/products/${name}`;
    emittedImages.set(file, path);
    written.push(path);
  }
  return written;
}

/** 記下每層分類（葉、父、根）第一件產品的圖。 */
function rememberFirstImage(path: string, image: string) {
  const parts = path.split('/');
  for (let depth = parts.length; depth > 0; depth--) {
    const key = parts.slice(0, depth).join('/');
    if (!firstProductImage.has(key)) firstProductImage.set(key, image);
  }
}

// 首頁輪播圖
for (const hero of HERO_IMAGES) {
  const source = join(snapshotImages, hero.file);
  if (!await exists(source)) { failures.push(`輪播圖缺少來源檔 ${hero.file}`); continue; }
  try { await toWebp(source, join(heroRoot, `${hero.slug}.webp`)); }
  catch (error) { failures.push(`輪播圖 ${hero.file} 轉檔失敗 — ${error}`); }
}

// 燈具
for (const [index, row] of lights.entries()) {
  const category = LIGHT_CATEGORIES.find(item => item.legacyId === row.categoryLegacyId);
  if (!category) { failures.push(`legacyId ${row.legacyId}：找不到分類 ${row.categoryLegacyId}`); continue; }
  const model = row.model.trim();
  if (!model) { failures.push(`legacyId ${row.legacyId}：無型號（規格欄位與麵包屑皆空），略過`); continue; }
  if (models.has(model)) { failures.push(`型號重複：${model}（legacyId ${row.legacyId}）`); continue; }
  models.add(model);
  const images = await emitImages(model, row.images);
  if (images.length === 0) { failures.push(`${model}：無可用圖片，略過`); continue; }
  const product = productSchema.parse({
    kind: 'light', model, name: row.name, watt: row.watt, beamAngle: row.beamAngle, cct: row.cct, cri: row.cri,
    cutoutDia: row.cutoutDia, dimensions: row.dimensions, voltage: row.voltage, socket: row.socket,
    colors: row.colors, extras: row.extras, notes: row.notes, images, order: index + 1, legacyId: row.legacyId,
  });
  const path = `lights/${category.parentSlug}/${category.slug}`;
  rememberFirstImage(path, images[0]);
  await writeJson(join(contentRoot, path, modelSlug(model), 'index.json'), product);
}

// 開關
for (const [index, row] of switches.entries()) {
  const category = SWITCH_CATEGORIES.find(item => item.legacyId === row.legacyCategoryId);
  if (!category) { failures.push(`${row.model}：找不到分類 ${row.legacyCategoryId}`); continue; }
  if (models.has(row.model)) { failures.push(`型號重複：${row.model}`); continue; }
  models.add(row.model);
  const images = await emitImages(row.model, row.images);
  if (images.length === 0) { failures.push(`${row.model}：無可用圖片，略過`); continue; }
  const product = productSchema.parse({
    kind: 'switch', model: row.model, series: row.series, type: row.type,
    description: row.description, images, order: index + 1, legacyCategoryId: row.legacyCategoryId,
  });
  const path = `switches/${category.series}/${category.slug}`;
  rememberFirstImage(path, images[0]);
  await writeJson(join(contentRoot, path, modelSlug(row.model), 'index.json'), product);
}

// 分類封面：優先用舊站的分類圖，沒有就退回該分類第一件產品的圖
const lightTopCovers = parseLightTopCovers(await snapshotPage('category') ?? '');
const switchLeafCovers = parseLeafCovers(await snapshotPage('category_switch') ?? '', 'goods.php');
const lightLeafCovers = new Map<number, string>();
for (const legacyName of [...new Set(LIGHT_CATEGORIES.map(category => category.parentLegacyName))]) {
  const html = await snapshotPage(snapshotName(lightSubCategoryUrl(legacyName)));
  if (html) for (const [id, file] of parseLeafCovers(html, 'goods_light.php')) lightLeafCovers.set(id, file);
}

const emittedCovers = new Map<string, string>();
async function coverFor(path: string, file: string | undefined): Promise<string | undefined> {
  if (file) {
    const cached = emittedCovers.get(file);
    if (cached) return cached;
    const source = join(snapshotImages, file);
    if (await exists(source)) {
      const name = `${path.replace(/\//g, '-')}.webp`;
      try {
        await toWebp(source, join(coverRoot, name));
        const url = `/categories/${name}`;
        emittedCovers.set(file, url);
        return url;
      } catch (error) { failures.push(`分類 ${path} 封面 ${file} 轉檔失敗 — ${error}`); }
    } else {
      failures.push(`分類 ${path}：snapshot 缺少封面圖 ${file}，改用第一件產品圖`);
    }
  }
  return firstProductImage.get(path);
}

async function writeCategory(path: string, name: string, order: number, coverFile?: string, description?: string) {
  const cover = await coverFor(path, coverFile);
  if (!cover) failures.push(`分類 ${path}：無封面圖也無產品圖`);
  await writeJson(join(contentRoot, path, '_category.json'), categorySchema.parse({ name, order, cover, description }));
}

await writeCategory('lights', '燈具', 1, undefined, '依空間與開孔尺寸選擇專業照明');
await writeCategory('switches', '開關面板', 2, undefined, 'Schneider Electric UNICA 與 ZENcelo 系列');

for (const category of [...new Map(LIGHT_CATEGORIES.map(item => [item.parentSlug, item])).values()]) {
  await writeCategory(`lights/${category.parentSlug}`, category.parentName, category.parentOrder, lightTopCovers.get(category.parentLegacyName));
}
for (const category of LIGHT_CATEGORIES) {
  await writeCategory(`lights/${category.parentSlug}/${category.slug}`, category.name, category.order, lightLeafCovers.get(category.legacyId));
}
for (const series of ['unica', 'zencelo'] as const) {
  await writeCategory(`switches/${series}`, series === 'unica' ? 'UNICA' : 'ZENcelo', series === 'unica' ? 1 : 2);
}
for (const category of SWITCH_CATEGORIES) {
  await writeCategory(`switches/${category.series}/${category.slug}`, category.name, category.order, switchLeafCovers.get(category.legacyId));
}

console.log(`匯出完成：${models.size} 件產品、${emittedImages.size} 張產品圖、${emittedCovers.size} 張分類封面。`);
if (failures.length > 0) { console.error('\n需人工處理：'); failures.forEach(line => console.error(`  ${line}`)); process.exitCode = 1; }

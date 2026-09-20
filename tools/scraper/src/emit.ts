import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productSchema, categorySchema } from '@glory-bright/shared/schema';
import { modelSlug } from '@glory-bright/shared/slug';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { imageName, toWebp } from './images.ts';
import { HERO_IMAGES } from './hero.ts';
import type { LightRow } from './report.ts';
import type { SwitchRecord } from './parse-switch.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const contentRoot = join(repo, 'site', 'src', 'content', 'products');
const publicRoot = join(repo, 'site', 'public', 'products');

const lights: LightRow[] = JSON.parse(await readFile(join(root, 'data', 'lights.json'), 'utf8'));
const switches: SwitchRecord[] = JSON.parse(await readFile(join(root, 'data', 'switches.json'), 'utf8'));

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

// 每次 emit 都從乾淨狀態重建，避免上一輪的殘留產品變成幽靈資料。
await rm(contentRoot, { recursive: true, force: true });
await rm(publicRoot, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });

const models = new Set<string>();
const failures: string[] = [];
/** 舊站的規格示意圖跨產品共用，同一來源檔只轉一次並共用路徑。 */
const emittedImages = new Map<string, string>();

async function emitImages(model: string, files: string[]): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const reused = emittedImages.get(file);
    if (reused) { if (!written.includes(reused)) written.push(reused); continue; }
    const source = join(root, 'snapshot', 'images', file);
    if (!await exists(source)) { failures.push(`${model}：snapshot 缺少圖檔 ${file}`); continue; }
    const name = imageName(model, written.length);
    try {
      await toWebp(source, join(publicRoot, name));
    } catch (error) {
      failures.push(`${model}：圖檔 ${file} 轉檔失敗 — ${error}`);
      continue;
    }
    const path = `/products/${name}`;
    emittedImages.set(file, path);
    written.push(path);
  }
  return written;
}

// 首頁輪播圖
const heroRoot = join(repo, 'site', 'public', 'hero');
await rm(heroRoot, { recursive: true, force: true });
await mkdir(heroRoot, { recursive: true });
for (const hero of HERO_IMAGES) {
  const source = join(root, 'snapshot', 'images', hero.file);
  if (!await exists(source)) { failures.push(`輪播圖缺少來源檔 ${hero.file}`); continue; }
  try {
    await toWebp(source, join(heroRoot, `${hero.slug}.webp`));
  } catch (error) {
    failures.push(`輪播圖 ${hero.file} 轉檔失敗 — ${error}`);
  }
}

// 分類 _category.json
await writeJson(join(contentRoot, 'lights', '_category.json'), categorySchema.parse({ name: '燈具', order: 1, description: '依空間與開孔尺寸選擇專業照明' }));
await writeJson(join(contentRoot, 'switches', '_category.json'), categorySchema.parse({ name: '開關面板', order: 2, description: 'Schneider Electric UNICA 與 ZENcelo 系列' }));

const lightParents = new Map(LIGHT_CATEGORIES.map(category => [category.parentSlug, category]));
for (const [slug, category] of lightParents) {
  await writeJson(join(contentRoot, 'lights', slug, '_category.json'), categorySchema.parse({ name: category.parentName, order: category.parentOrder }));
}
for (const category of LIGHT_CATEGORIES) {
  await writeJson(join(contentRoot, 'lights', category.parentSlug, category.slug, '_category.json'), categorySchema.parse({ name: category.name, order: category.order }));
}
for (const series of ['unica', 'zencelo'] as const) {
  await writeJson(join(contentRoot, 'switches', series, '_category.json'), categorySchema.parse({ name: series === 'unica' ? 'UNICA' : 'ZENcelo', order: series === 'unica' ? 1 : 2 }));
}
for (const category of SWITCH_CATEGORIES) {
  await writeJson(join(contentRoot, 'switches', category.series, category.slug, '_category.json'), categorySchema.parse({ name: category.name, order: category.order }));
}

// 燈具
for (const [index, row] of lights.entries()) {
  const category = LIGHT_CATEGORIES.find(item => item.legacyId === row.categoryLegacyId);
  if (!category) { failures.push(`legacyId ${row.legacyId}：找不到分類 ${row.categoryLegacyId}`); continue; }
  const model = row.model.trim() || `GB-LEGACY-${row.legacyId}`;
  if (!row.model.trim()) failures.push(`legacyId ${row.legacyId}：舊站無型號，暫以 ${model} 代替，需業主確認`);
  if (models.has(model)) { failures.push(`型號重複：${model}（legacyId ${row.legacyId}）`); continue; }
  models.add(model);
  const images = await emitImages(model, row.images);
  if (images.length === 0) { failures.push(`${model}：無可用圖片，略過`); continue; }
  const product = productSchema.parse({
    kind: 'light', model, watt: row.watt, beamAngle: row.beamAngle, cct: row.cct, cri: row.cri,
    cutoutDia: row.cutoutDia, dimensions: row.dimensions, voltage: row.voltage, socket: row.socket,
    colors: row.colors, images, order: index + 1, legacyId: row.legacyId,
  });
  await writeJson(join(contentRoot, 'lights', category.parentSlug, category.slug, modelSlug(model), 'index.json'), product);
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
  await writeJson(join(contentRoot, 'switches', category.series, category.slug, modelSlug(row.model), 'index.json'), product);
}

console.log(`匯出完成：${models.size} 件產品、${emittedImages.size} 張圖。`);
if (failures.length > 0) { console.error('\n需人工處理：'); failures.forEach(line => console.error(`  ${line}`)); process.exitCode = 1; }

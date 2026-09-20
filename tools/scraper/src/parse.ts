import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLightDetail } from './parse-light.ts';
import { parseSwitchList, type SwitchRecord } from './parse-switch.ts';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { snapshotName, lightListUrl, switchListUrl, lightDetailUrl } from './urls.ts';
import { buildReport, type LightRow } from './report.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = join(root, 'snapshot');

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
const pagePath = (url: string) => join(snapshot, 'pages', `${snapshotName(url)}.html`);
const pageAt = (url: string) => readFile(pagePath(url), 'utf8');
const pageExists = (url: string) => exists(pagePath(url));

// 建立 明細 legacyId → 分類 的對照
const owner = new Map<number, number>();
for (const category of LIGHT_CATEGORIES) {
  for (let page = 1; ; page++) {
    const url = lightListUrl(category.legacyId, page);
    if (!await pageExists(url)) break;
    const html = await pageAt(url);
    for (const match of html.matchAll(/goods_light_list\.php\?id=(\d+)/g)) {
      const id = Number(match[1]);
      if (!owner.has(id)) owner.set(id, category.legacyId);
    }
  }
}

const lights: LightRow[] = [];
for (const [legacyId, categoryLegacyId] of [...owner].sort((a, b) => a[0] - b[0])) {
  const url = lightDetailUrl(legacyId);
  if (!await pageExists(url)) { console.error(`snapshot 缺少明細頁 ${legacyId}`); continue; }
  lights.push({ ...parseLightDetail(await pageAt(url), legacyId), categoryLegacyId });
}

const switches: SwitchRecord[] = [];
for (const category of SWITCH_CATEGORIES) {
  for (let page = 1; ; page++) {
    const url = switchListUrl(category.legacyId, page);
    if (!await pageExists(url)) break;
    switches.push(...parseSwitchList(await pageAt(url), category));
  }
}

const missingImages: string[] = [];
for (const name of new Set([...lights, ...switches].flatMap(row => row.images))) {
  if (!await exists(join(snapshot, 'images', name))) missingImages.push(name);
}

await mkdir(join(root, 'data'), { recursive: true });
await writeFile(join(root, 'data', 'lights.json'), `${JSON.stringify(lights, null, 2)}\n`);
await writeFile(join(root, 'data', 'switches.json'), `${JSON.stringify(switches, null, 2)}\n`);
await writeFile(join(root, 'report.md'), buildReport({ lights, switches, missingImages }));
console.log(`解析完成：燈具 ${lights.length}、開關 ${switches.length}、缺圖 ${missingImages.length}。報告見 tools/scraper/report.md`);

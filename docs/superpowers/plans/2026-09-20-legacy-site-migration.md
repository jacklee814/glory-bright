# 舊站資料遷移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `www.glory-bright.com.tw` 舊站的 137 件燈具、57 件開關面板與聯絡資訊，經由可重跑的離線 pipeline 遷移到新的 Astro 靜態型錄站。

**Architecture:** 三階段 pipeline。`crawl` 以嚴格節流抓取舊站並存成 `tools/scraper/snapshot/` 冷備份；`parse` 只讀 snapshot、不發網路請求，產出中間 JSON 與人工驗收報告；`emit` 驗證 schema 後寫入 Astro content collections 並轉檔圖片。解析器是純函式，以 snapshot 內的真實 HTML 作為測試 fixture。

**Tech Stack:** TypeScript、tsx、Cheerio、Sharp、Zod 3、Astro 5、`node:test`（Node 24 內建，不引入測試框架相依）。

**Spec:** `docs/superpowers/specs/2026-09-20-legacy-site-migration-design.md`

## Global Constraints

- 不使用 React、Vue、UI library、CMS、資料庫、表單服務或前端框架。
- 新增相依僅限 Cheerio、Sharp、tsx。測試使用 Node 內建 `node:test` 與 `node:assert/strict`。
- 網址全部尾隨 `/`；Astro `base` 為 `/glory-bright/`，站內連結與 public 圖片一律經 `siteUrl()`。
- 圖片、資料夾與檔名使用 ASCII slug；產品資料須通過 `@glory-bright/shared/schema` 驗證。
- **不匯入售價至 content collections。**
- **不自行決定公司地址**，維持「待業主確認」。
- 舊站主機（HiNet）會在請求過於密集時回傳 HTTP 200 但內容為 `wfs.hinet.net` 攔截頁。**任何抓取都必須偵測此頁並視為失敗**，絕不可寫入 snapshot。
- `parse` 與 `emit` 階段禁止發出任何網路請求。
- 所有 commit 在 `feature/legacy-site-migration` 分支。

---

### Task 1: Scraper 基礎設施與節流 HTTP client

**Files:**
- Modify: `tools/scraper/package.json`
- Create: `tools/scraper/tsconfig.json`
- Create: `tools/scraper/src/http.ts`
- Test: `tools/scraper/test/http.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `isInterceptPage(html: string): boolean`
  - `class RateLimiter { constructor(minIntervalMs: number); wait(): Promise<void> }`
  - `fetchText(url: string, options?: { retries?: number }): Promise<string>` — 丟出 `InterceptError` 或 `HttpError`
  - `fetchBinary(url: string): Promise<Buffer>`
  - `class InterceptError extends Error`

- [ ] **Step 1: 寫失敗的測試**

`tools/scraper/test/http.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInterceptPage, RateLimiter } from '../src/http.ts';

test('偵測 HiNet WFS 攔截頁', () => {
  const html = `<html><head><meta http-equiv="pragma" content="no-cache"><meta http-equiv="refresh" content="0;url='http://wfs.hinet.net?flag=W&uid=?&host=www.glory-bright.com.tw&mwn=MC006&&S012'"></head></html>`;
  assert.equal(isInterceptPage(html), true);
});

test('正常產品頁不被判為攔截頁', () => {
  const html = `<html><head><title>榮輝照明科技有限公司</title></head><body>GB-DMR-2060-1</body></html>`;
  assert.equal(isInterceptPage(html), false);
});

test('空白回應視為攔截頁', () => {
  assert.equal(isInterceptPage(''), true);
});

test('RateLimiter 兩次 wait 之間至少間隔設定值', async () => {
  const limiter = new RateLimiter(120);
  const started = Date.now();
  await limiter.wait();
  await limiter.wait();
  assert.ok(Date.now() - started >= 120, '第二次 wait 應被延遲');
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`Cannot find module '../src/http.ts'`。

- [ ] **Step 3: 安裝相依並建立設定**

`tools/scraper/package.json` 改為：

```json
{
  "name": "scraper",
  "private": true,
  "type": "module",
  "scripts": {
    "crawl": "tsx src/crawl.ts",
    "parse": "tsx src/parse.ts",
    "emit": "tsx src/emit.ts",
    "test": "node --import tsx --test test/"
  },
  "dependencies": {
    "@glory-bright/shared": "workspace:*",
    "cheerio": "^1.0.0",
    "sharp": "^0.33.5",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.8.3",
    "@types/node": "^22.10.0"
  }
}
```

`tools/scraper/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

執行 `pnpm install`（在 repo 根目錄）。

- [ ] **Step 4: 實作 `src/http.ts`**

```ts
/** 舊站主機在請求過密時回傳 HTTP 200 但內容為 HiNet WFS 攔截頁，必須視為失敗。 */
export class InterceptError extends Error {
  constructor(url: string) { super(`舊站回傳 HiNet 攔截頁，請加大間隔後重試：${url}`); this.name = 'InterceptError'; }
}
export class HttpError extends Error {
  constructor(url: string, status: number) { super(`HTTP ${status}：${url}`); this.name = 'HttpError'; }
}

export function isInterceptPage(html: string): boolean {
  if (html.trim().length === 0) return true;
  return html.includes('wfs.hinet.net');
}

export class RateLimiter {
  #next = 0;
  constructor(private readonly minIntervalMs: number) {}
  async wait(): Promise<void> {
    const delay = this.#next - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    this.#next = Date.now() + this.minIntervalMs;
  }
}

const USER_AGENT = 'Mozilla/5.0 (compatible; GloryBrightMigration/1.0)';
/** 舊站是 Apache 1.3.39 且受 HiNet 流量管控，間隔取 3 秒。 */
export const limiter = new RateLimiter(3000);

async function request(url: string): Promise<Response> {
  await limiter.wait();
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!response.ok) throw new HttpError(url, response.status);
  return response;
}

export async function fetchText(url: string, options: { retries?: number } = {}): Promise<string> {
  const retries = options.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const html = await response_text(await request(url));
      if (isInterceptPage(html)) throw new InterceptError(url);
      return html;
    } catch (error) {
      if (attempt >= retries) throw error;
      // 被攔截時退避時間加倍，其他錯誤固定退避。
      const backoff = error instanceof InterceptError ? 60_000 * (attempt + 1) : 5_000;
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

async function response_text(response: Response): Promise<string> {
  // 舊站是 UTF-8 with BOM，去掉 BOM 以免污染第一個標籤。
  return (await response.text()).replace(/^﻿/, '');
}

export async function fetchBinary(url: string): Promise<Buffer> {
  const response = await request(url);
  return Buffer.from(await response.arrayBuffer());
}
```

- [ ] **Step 5: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：4 個測試 PASS。

- [ ] **Step 6: Commit**

```bash
git add tools/scraper/package.json tools/scraper/tsconfig.json tools/scraper/src/http.ts tools/scraper/test/http.test.ts pnpm-lock.yaml
git commit -m "feat(scraper): add throttled http client with HiNet intercept detection"
```

---

### Task 2: 標籤正規化與分類表

**Files:**
- Create: `tools/scraper/src/labels.ts`
- Modify: `tools/scraper/src/taxonomy.ts`（整份重寫）
- Test: `tools/scraper/test/labels.test.ts`
- Test: `tools/scraper/test/taxonomy.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `normalizeLabel(raw: string): string` — 去除所有 Unicode 空白
  - `resolveField(rawLabel: string): LightField | null`，`type LightField = 'model' | 'watt' | 'beamAngle' | 'cct' | 'cri' | 'cutoutDia' | 'dimensions' | 'voltage' | 'colors' | 'socket'`
  - `LIGHT_CATEGORIES: LegacyLightCategory[]`，`interface LegacyLightCategory { legacyId: number; legacyName: string; parentSlug: string; parentName: string; parentOrder: number; slug: string; name: string; order: number }`
  - `SWITCH_CATEGORIES: LegacySwitchCategory[]`，`interface LegacySwitchCategory { legacyId: number; series: 'unica' | 'zencelo'; type: 'switch' | 'socket' | 'panel'; slug: string; name: string; order: number }`

- [ ] **Step 1: 寫失敗的測試**

`tools/scraper/test/labels.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLabel, resolveField } from '../src/labels.ts';

test('去除表意空格 U+3000', () => {
  assert.equal(normalizeLabel('功　　率'), '功率');
});

test('去除細空格 U+2009', () => {
  assert.equal(normalizeLabel('演  色  性'), '演色性');
});

test('去除半形空格與不換行空格', () => {
  assert.equal(normalizeLabel('埋 入 孔 徑'), '埋入孔徑');
  assert.equal(normalizeLabel('材 質 顏 色'), '材質顏色');
});

test('使用電壓與輸入電壓對應到同一欄位', () => {
  assert.equal(resolveField('使用電壓'), 'voltage');
  assert.equal(resolveField('輸 入 電 壓'), 'voltage');
});

test('各欄位別名解析', () => {
  assert.equal(resolveField('型號'), 'model');
  assert.equal(resolveField('功　　率'), 'watt');
  assert.equal(resolveField('角　　度'), 'beamAngle');
  assert.equal(resolveField('色　　溫'), 'cct');
  assert.equal(resolveField('演  色  性'), 'cri');
  assert.equal(resolveField('埋 入 孔 徑'), 'cutoutDia');
  assert.equal(resolveField('尺　　寸'), 'dimensions');
  assert.equal(resolveField('材 質 顏 色'), 'colors');
  assert.equal(resolveField('燈座'), 'socket');
});

test('未知標籤回傳 null', () => {
  assert.equal(resolveField('保固年限'), null);
});
```

`tools/scraper/test/taxonomy.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from '../src/taxonomy.ts';

test('涵蓋 13 個有商品的燈具子類（已排除 0 件的 58、65）', () => {
  assert.equal(LIGHT_CATEGORIES.length, 13);
  const ids = LIGHT_CATEGORIES.map(c => c.legacyId).sort((a, b) => a - b);
  assert.deepEqual(ids, [42, 43, 44, 45, 46, 47, 50, 54, 55, 57, 60, 62, 63]);
});

test('軌道燈下的底線命名已正名', () => {
  const box = LIGHT_CATEGORIES.find(c => c.legacyId === 50)!;
  assert.equal(box.legacyName, '盒_燈');
  assert.equal(box.name, '盒燈');
  assert.equal(box.parentSlug, 'track');
  const module = LIGHT_CATEGORIES.find(c => c.legacyId === 60)!;
  assert.equal(module.name, '模組式');
  assert.equal(module.parentSlug, 'track');
});

test('slug 在同一父層下唯一', () => {
  const pairs = LIGHT_CATEGORIES.map(c => `${c.parentSlug}/${c.slug}`);
  assert.equal(new Set(pairs).size, pairs.length);
});

test('涵蓋 5 個開關子類並標註系列與類型', () => {
  assert.equal(SWITCH_CATEGORIES.length, 5);
  const unicaPanel = SWITCH_CATEGORIES.find(c => c.legacyId === 597)!;
  assert.equal(unicaPanel.series, 'unica');
  assert.equal(unicaPanel.type, 'panel');
  const zencelSocket = SWITCH_CATEGORIES.find(c => c.legacyId === 582)!;
  assert.equal(zencelSocket.series, 'zencelo');
  assert.equal(zencelSocket.type, 'socket');
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`Cannot find module '../src/labels.ts'`。

- [ ] **Step 3: 實作 `src/labels.ts`**

```ts
export type LightField = 'model' | 'watt' | 'beamAngle' | 'cct' | 'cri' | 'cutoutDia' | 'dimensions' | 'voltage' | 'colors' | 'socket';

/** 舊站標籤夾雜 U+3000、U+2009、U+00A0 與半形空格作為排版填充，比對前全部去除。 */
export function normalizeLabel(raw: string): string {
  return raw.replace(/[\s  -​　]/gu, '');
}

const ALIASES: Record<string, LightField> = {
  型號: 'model',
  功率: 'watt',
  角度: 'beamAngle',
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
```

- [ ] **Step 4: 實作 `src/taxonomy.ts`（整份取代既有內容）**

```ts
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
  { legacyId: 42, legacyName: 'MR16型',   parentSlug: 'downlight', parentName: '崁燈',        parentOrder: 1, slug: 'mr16',    name: 'MR16型',   order: 1 },
  { legacyId: 44, legacyName: 'AR111型',  parentSlug: 'downlight', parentName: '崁燈',        parentOrder: 1, slug: 'ar111',   name: 'AR111型',  order: 2 },
  { legacyId: 45, legacyName: '泛光型',   parentSlug: 'downlight', parentName: '崁燈',        parentOrder: 1, slug: 'flood',   name: '泛光型',   order: 3 },
  { legacyId: 47, legacyName: '盒燈',     parentSlug: 'downlight', parentName: '崁燈',        parentOrder: 1, slug: 'box',     name: '盒燈',     order: 4 },
  { legacyId: 55, legacyName: '模組式',   parentSlug: 'downlight', parentName: '崁燈',        parentOrder: 1, slug: 'module',  name: '模組式',   order: 5 },
  { legacyId: 43, legacyName: 'MR_AR型',  parentSlug: 'track',     parentName: '軌道燈',      parentOrder: 2, slug: 'mr-ar',   name: 'MR/AR型',  order: 1 },
  { legacyId: 50, legacyName: '盒_燈',    parentSlug: 'track',     parentName: '軌道燈',      parentOrder: 2, slug: 'box',     name: '盒燈',     order: 2 },
  { legacyId: 60, legacyName: '模組式_',  parentSlug: 'track',     parentName: '軌道燈',      parentOrder: 2, slug: 'module',  name: '模組式',   order: 3 },
  { legacyId: 46, legacyName: '吸頂式',   parentSlug: 'ceiling',   parentName: '吸頂懸吊燈',  parentOrder: 3, slug: 'surface', name: '吸頂式',   order: 1 },
  { legacyId: 54, legacyName: '鋁條燈',   parentSlug: 'linear',    parentName: '線型燈',      parentOrder: 4, slug: 'alu-bar', name: '鋁條燈',   order: 1 },
  { legacyId: 57, legacyName: '軟帶燈',   parentSlug: 'linear',    parentName: '線型燈',      parentOrder: 4, slug: 'strip',   name: '軟帶燈',   order: 2 },
  { legacyId: 62, legacyName: '辦公室照明', parentSlug: 'office',  parentName: '辦公工程照明', parentOrder: 5, slug: 'indoor',  name: '辦公室照明', order: 1 },
  { legacyId: 63, legacyName: '工程照明',   parentSlug: 'office',  parentName: '辦公工程照明', parentOrder: 5, slug: 'project', name: '工程照明',   order: 2 },
];

/** 舊站 goods.php?id=<legacyId>。開關無明細頁，資料全在列表頁。 */
export const SWITCH_CATEGORIES: LegacySwitchCategory[] = [
  { legacyId: 578, series: 'unica',   type: 'switch', slug: 'switch',     name: 'UNICA 開關',    order: 1 },
  { legacyId: 579, series: 'unica',   type: 'socket', slug: 'socket',     name: 'UNICA 插座',    order: 2 },
  { legacyId: 597, series: 'unica',   type: 'panel',  slug: 'euro-panel', name: 'UNICA 歐規面板', order: 3 },
  { legacyId: 581, series: 'zencelo', type: 'switch', slug: 'switch',     name: 'ZENcelo 開關',  order: 1 },
  { legacyId: 582, series: 'zencelo', type: 'socket', slug: 'socket',     name: 'ZENcelo 插座',  order: 2 },
];
```

- [ ] **Step 5: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add tools/scraper/src/labels.ts tools/scraper/src/taxonomy.ts tools/scraper/test/labels.test.ts tools/scraper/test/taxonomy.test.ts
git commit -m "feat(scraper): add label normalisation and rebuilt legacy taxonomy"
```

---

### Task 3: URL 列舉與 crawl 執行

**Files:**
- Create: `tools/scraper/src/urls.ts`
- Modify: `tools/scraper/src/crawl.ts`（整份取代既有的 throw）
- Test: `tools/scraper/test/urls.test.ts`
- Create: `tools/scraper/snapshot/**`（執行產物，commit 進 repo）

**Interfaces:**
- Consumes: `LIGHT_CATEGORIES`、`SWITCH_CATEGORIES`（Task 2）、`fetchText`、`fetchBinary`、`isInterceptPage`（Task 1）
- Produces:
  - `BASE = 'http://www.glory-bright.com.tw/'`
  - `snapshotName(url: string): string` — URL → 安全的 ASCII 檔名
  - `lightListUrl(legacyId: number, page: number): string`
  - `switchListUrl(legacyId: number, page: number): string`
  - `lightDetailUrl(legacyId: number): string`
  - snapshot 目錄結構：`snapshot/pages/<snapshotName>.html`、`snapshot/images/<原檔名>`、`snapshot/manifest.json`
  - `manifest.json` 形狀：`{ fetchedAt: string; pages: Record<string, string>; images: Record<string, string>; failures: string[] }`（key 為 URL，value 為相對檔名）

- [ ] **Step 1: 寫失敗的測試**

`tools/scraper/test/urls.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotName, lightListUrl, switchListUrl, lightDetailUrl } from '../src/urls.ts';

test('列表頁 URL 帶分頁參數', () => {
  assert.equal(lightListUrl(42, 1), 'http://www.glory-bright.com.tw/goods_light.php?id=42&act=goods&page=1');
  assert.equal(switchListUrl(578, 2), 'http://www.glory-bright.com.tw/goods.php?id=578&act=goods&page=2');
});

test('明細頁 URL', () => {
  assert.equal(lightDetailUrl(120), 'http://www.glory-bright.com.tw/goods_light_list.php?id=120');
});

test('snapshotName 產生安全的 ASCII 檔名', () => {
  assert.equal(snapshotName('http://www.glory-bright.com.tw/goods_light.php?id=42&act=goods&page=1'), 'goods_light-id42-act-goods-page1');
  assert.equal(snapshotName('http://www.glory-bright.com.tw/index.php'), 'index');
});

test('snapshotName 對不同 URL 不碰撞', () => {
  const a = snapshotName(lightListUrl(42, 1));
  const b = snapshotName(lightListUrl(42, 2));
  const c = snapshotName(switchListUrl(42, 1));
  assert.equal(new Set([a, b, c]).size, 3);
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`Cannot find module '../src/urls.ts'`。

- [ ] **Step 3: 實作 `src/urls.ts`**

```ts
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
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：全部 PASS。

- [ ] **Step 5: 實作 `src/crawl.ts`（整份取代既有的 throw）**

```ts
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchText, fetchBinary, InterceptError } from './http.ts';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { BASE, snapshotName, lightListUrl, switchListUrl, lightDetailUrl } from './urls.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = join(root, 'snapshot');
const force = process.argv.includes('--force');

interface Manifest { fetchedAt: string; pages: Record<string, string>; images: Record<string, string>; failures: string[] }

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }

async function loadManifest(): Promise<Manifest> {
  const path = join(snapshot, 'manifest.json');
  if (await exists(path)) return JSON.parse(await readFile(path, 'utf8'));
  return { fetchedAt: new Date().toISOString(), pages: {}, images: {}, failures: [] };
}

const manifest = await loadManifest();

if (Object.keys(manifest.pages).length > 0 && !force) {
  console.log(`snapshot 已存在（${Object.keys(manifest.pages).length} 頁）。續抓缺漏項目；要整批重抓請加 --force。`);
}

async function save(manifest: Manifest) {
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
    await save(manifest);
    console.log(`✓ ${url}`);
    return html;
  } catch (error) {
    const reason = error instanceof InterceptError ? '被 HiNet 攔截' : String(error);
    console.error(`✗ ${url} — ${reason}`);
    if (!manifest.failures.includes(url)) manifest.failures.push(url);
    await save(manifest);
    if (error instanceof InterceptError) throw error; // 被攔截就停止，避免持續打站
    return null;
  }
}

async function image(relative: string) {
  const clean = relative.replace(/^(\.\.\/)+/, '');
  const url = BASE + clean.split('/').map(encodeURIComponent).join('/');
  const name = clean.split('/').at(-1)!;
  const path = join(snapshot, 'images', name);
  if (manifest.images[url] && await exists(path)) return;
  try {
    const data = await fetchBinary(url);
    await mkdir(join(snapshot, 'images'), { recursive: true });
    await writeFile(path, data);
    manifest.images[url] = `images/${name}`;
    await save(manifest);
    console.log(`✓ 圖 ${name}`);
  } catch (error) {
    console.error(`✗ 圖 ${name} — ${error}`);
    if (!manifest.failures.includes(url)) manifest.failures.push(url);
    await save(manifest);
  }
}

function lastPage(html: string, pattern: RegExp): number {
  return Math.max(1, ...[...html.matchAll(pattern)].map(match => Number(match[1])));
}

// 靜態頁
for (const path of ['index.php', 'category.php', 'category_light.php', 'category_switch.php', 'news.php', 'news_list.php?id=124', 'contact_us.php']) {
  await page(BASE + path);
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
```

- [ ] **Step 6: 執行 crawl**

```bash
cd tools/scraper && pnpm crawl
```

以 3 秒間隔、約 250 次請求計算，預計 15–25 分鐘。若因 HiNet 攔截中斷，等待 10 分鐘後重跑同一指令即可續抓（已抓過的頁會跳過）。重複直到 `失敗 0 項`。

- [ ] **Step 7: 驗證 snapshot 完整性**

```bash
cd tools/scraper && node --import tsx -e "
const m = JSON.parse(await import('node:fs').then(fs => fs.readFileSync('snapshot/manifest.json', 'utf8')));
const details = Object.keys(m.pages).filter(u => u.includes('goods_light_list.php'));
console.log('明細頁', details.length, '應為 137');
console.log('圖片', Object.keys(m.images).length);
console.log('失敗', m.failures.length, '應為 0');
const bad = Object.values(m.pages).filter(p => require('node:fs').readFileSync('snapshot/' + p, 'utf8').includes('wfs.hinet.net'));
console.log('含攔截頁的檔案', bad.length, '應為 0');
"
```

預期：明細頁 137、失敗 0、含攔截頁的檔案 0。

- [ ] **Step 8: Commit snapshot**

```bash
git add tools/scraper/src/urls.ts tools/scraper/src/crawl.ts tools/scraper/test/urls.test.ts tools/scraper/snapshot
git commit -m "feat(scraper): crawl legacy site into committed cold-backup snapshot"
```

---

### Task 4: 燈具明細解析器

**Files:**
- Create: `tools/scraper/src/parse-light.ts`
- Test: `tools/scraper/test/parse-light.test.ts`

**Interfaces:**
- Consumes: `resolveField`、`normalizeLabel`（Task 2）、snapshot HTML（Task 3）
- Produces:
  - `interface LightRecord { legacyId: number; model: string; watt?: number; beamAngle: number[]; cct: number[]; cri?: number; cutoutDia?: number; dimensions?: string; voltage?: string; colors: string[]; socket?: string; images: string[]; unknownLabels: string[] }`
  - `parseLightDetail(html: string, legacyId: number): LightRecord`
  - `parseNumberList(raw: string): number[]`

- [ ] **Step 1: 寫失敗的測試（使用 snapshot 內的真實 HTML）**

`tools/scraper/test/parse-light.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLightDetail, parseNumberList } from '../src/parse-light.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (legacyId: number) => readFileSync(join(root, 'snapshot', 'pages', `goods_light_list-id${legacyId}.html`), 'utf8');

test('parseNumberList 處理多種分隔符', () => {
  assert.deepEqual(parseNumberList('20°/40°/60°'), [20, 40, 60]);
  assert.deepEqual(parseNumberList('3000K、4000K'), [3000, 4000]);
  assert.deepEqual(parseNumberList('120'), [120]);
  assert.deepEqual(parseNumberList(''), []);
});

test('解析完整規格的崁燈（id=120）', () => {
  const record = parseLightDetail(load(120), 120);
  assert.equal(record.model, 'GB-DMR-2060-1');
  assert.equal(record.watt, 9);
  assert.deepEqual(record.beamAngle, [20, 40, 60]);
  assert.deepEqual(record.cct, [3000, 4000]);
  assert.equal(record.cri, 90);
  assert.equal(record.cutoutDia, 60);
  assert.equal(record.voltage, 'AC100V-240V');
  assert.deepEqual(record.colors, ['白', '黑']);
  assert.ok(record.dimensions?.includes('70'));
  assert.ok(record.images.length >= 1);
  assert.deepEqual(record.unknownLabels, []);
});

test('解析使用「輸 入 電 壓」變體的產品（id=130）', () => {
  const record = parseLightDetail(load(130), 130);
  assert.ok(record.voltage, '輸入電壓應被解析到 voltage');
  assert.ok(record.model.length > 0);
});

test('無任何規格欄位的產品不丟例外（id=238）', () => {
  const record = parseLightDetail(load(238), 238);
  assert.equal(record.watt, undefined);
  assert.equal(record.legacyId, 238);
  assert.ok(record.images.length >= 1, '至少要有主圖');
});

test('以燈座取代功率的產品（id=191）', () => {
  const record = parseLightDetail(load(191), 191);
  assert.equal(record.watt, undefined);
  assert.ok(record.socket, '燈座欄位應被解析');
  assert.deepEqual(record.unknownLabels, []);
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`Cannot find module '../src/parse-light.ts'`。

- [ ] **Step 3: 實作 `src/parse-light.ts`**

```ts
import * as cheerio from 'cheerio';
import { resolveField, normalizeLabel } from './labels.ts';

export interface LightRecord {
  legacyId: number; model: string;
  watt?: number; beamAngle: number[]; cct: number[]; cri?: number; cutoutDia?: number;
  dimensions?: string; voltage?: string; colors: string[]; socket?: string;
  images: string[]; unknownLabels: string[];
}

export function parseNumberList(raw: string): number[] {
  return [...raw.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
}

const firstNumber = (raw: string) => parseNumberList(raw)[0];

export function parseLightDetail(html: string, legacyId: number): LightRecord {
  const $ = cheerio.load(html);
  const record: LightRecord = { legacyId, model: '', beamAngle: [], cct: [], colors: [], images: [], unknownLabels: [] };

  for (const element of $('.light_list_left, .light_list_right').find('img').toArray()) {
    const source = $(element).attr('src');
    if (source?.includes('goods_light_img/')) {
      const name = source.replace(/^(\.\.\/)+/, '').split('/').at(-1)!;
      if (!record.images.includes(name)) record.images.push(name);
    }
  }

  for (const element of $('.light_list_left div').toArray()) {
    const text = $(element).text().replace(/ /g, ' ').trim();
    const separator = text.search(/[：:]/);
    if (separator < 0) continue;
    const rawLabel = text.slice(0, separator);
    const value = text.slice(separator + 1).trim();
    if (!normalizeLabel(rawLabel) || !value) continue;
    const field = resolveField(rawLabel);
    if (!field) { const label = normalizeLabel(rawLabel); if (!record.unknownLabels.includes(label)) record.unknownLabels.push(label); continue; }
    switch (field) {
      case 'model': record.model = value; break;
      case 'watt': record.watt = firstNumber(value); break;
      case 'beamAngle': record.beamAngle = parseNumberList(value); break;
      case 'cct': record.cct = parseNumberList(value); break;
      case 'cri': record.cri = firstNumber(value); break;
      case 'cutoutDia': record.cutoutDia = firstNumber(value); break;
      case 'dimensions': record.dimensions = value; break;
      case 'voltage': record.voltage = value; break;
      case 'colors': record.colors = value.split(/[、,／\/]/).map(part => part.trim()).filter(Boolean); break;
      case 'socket': record.socket = value; break;
    }
  }
  return record;
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：全部 PASS。若 `id=191`／`id=238` 的斷言失敗，讀取該 snapshot 檔案確認實際結構後調整解析器，**不要修改測試期望以迴避問題**。

- [ ] **Step 5: Commit**

```bash
git add tools/scraper/src/parse-light.ts tools/scraper/test/parse-light.test.ts
git commit -m "feat(scraper): parse legacy light detail pages"
```

---

### Task 5: 開關列表解析器

**Files:**
- Create: `tools/scraper/src/parse-switch.ts`
- Test: `tools/scraper/test/parse-switch.test.ts`

**Interfaces:**
- Consumes: `SWITCH_CATEGORIES`（Task 2）、snapshot HTML（Task 3）
- Produces:
  - `interface SwitchRecord { model: string; series: 'unica' | 'zencelo'; type: 'switch' | 'socket' | 'panel'; description: string[]; images: string[]; legacyCategoryId: number }`
  - `parseSwitchList(html: string, category: LegacySwitchCategory): SwitchRecord[]`

- [ ] **Step 1: 寫失敗的測試**

`tools/scraper/test/parse-switch.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSwitchList } from '../src/parse-switch.ts';
import { SWITCH_CATEGORIES } from '../src/taxonomy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (legacyId: number, page = 1) => readFileSync(join(root, 'snapshot', 'pages', `goods-id${legacyId}-act-goods-page${page}.html`), 'utf8');
const category = (legacyId: number) => SWITCH_CATEGORIES.find(item => item.legacyId === legacyId)!;

test('解析 UNICA 開關列表（id=578）', () => {
  const records = parseSwitchList(load(578), category(578));
  assert.equal(records.length, 6);
  const first = records[0];
  assert.equal(first.model, '010102');
  assert.equal(first.series, 'unica');
  assert.equal(first.type, 'switch');
  assert.deepEqual(first.images, ['010102.JPG']);
  assert.ok(first.description.includes('純銅色 金屬 三切開關'));
  assert.ok(first.description.includes('三路對切'));
});

test('售價不進入 description', () => {
  const records = parseSwitchList(load(578), category(578));
  for (const record of records) {
    assert.ok(record.description.every(line => !line.includes('售價')), `售價不得保留：${record.model}`);
    assert.ok(record.description.every(line => !/^\d+$/.test(line)), `純數字行應已被濾除：${record.model}`);
  }
});

test('型號在同一分類內唯一', () => {
  const records = parseSwitchList(load(578), category(578));
  assert.equal(new Set(records.map(record => record.model)).size, records.length);
});

test('ZENcelo 插座標註正確系列與類型（id=582）', () => {
  const records = parseSwitchList(load(582), category(582));
  assert.ok(records.length > 0);
  assert.ok(records.every(record => record.series === 'zencelo' && record.type === 'socket'));
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`Cannot find module '../src/parse-switch.ts'`。

- [ ] **Step 3: 實作 `src/parse-switch.ts`**

```ts
import * as cheerio from 'cheerio';
import type { LegacySwitchCategory } from './taxonomy.ts';

export interface SwitchRecord {
  model: string; series: 'unica' | 'zencelo'; type: 'switch' | 'socket' | 'panel';
  description: string[]; images: string[]; legacyCategoryId: number;
}

/** 舊站每個產品是一個 <td id="img_big">，內含圖片與自由格式描述行；售價不遷移。 */
export function parseSwitchList(html: string, category: LegacySwitchCategory): SwitchRecord[] {
  const $ = cheerio.load(html);
  const records: SwitchRecord[] = [];
  const seen = new Set<string>();

  for (const cell of $('td#img_big, td[id="img_big"]').toArray()) {
    const node = $(cell);
    const source = node.find('img').attr('src');
    if (!source?.includes('goods_img/')) continue;
    const file = decodeURIComponent(source.replace(/^(\.\.\/)+/, '').split('/').at(-1)!);
    const model = file.replace(/\.[^.]+$/, '').trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);

    const description = node.html()!
      .split(/<br\s*\/?>/i).slice(1)
      .map(part => cheerio.load(`<div>${part}</div>`)('div').text())
      .map(line => line.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0 && !line.includes('售價') && !/^\d+$/.test(line));

    records.push({ model, series: category.series, type: category.type, description, images: [file], legacyCategoryId: category.legacyId });
  }
  return records;
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add tools/scraper/src/parse-switch.ts tools/scraper/test/parse-switch.test.ts
git commit -m "feat(scraper): parse legacy switch listing pages"
```

---

### Task 6: 資料契約變更與站台同步

**Files:**
- Modify: `shared/schema.ts`
- Modify: `site/src/components/ProductCard.astro`
- Modify: `site/src/components/Catalog.astro`
- Modify: `site/src/scripts/filter.ts`
- Modify: `site/src/scripts/compare.ts`
- Modify: `site/src/pages/p/[model].astro`
- Delete: `site/src/content/products/**`（全部示範產品與分類）
- Delete: `site/public/products/*.svg`

**Interfaces:**
- Consumes: 無
- Produces（`@glory-bright/shared/schema`）：
  - `lightSchema`：`watt` 改 `z.number().positive().optional()`，新增 `socket: z.string().optional()`
  - `switchSchema`：`{ kind: 'switch', model, series: 'unica'|'zencelo', type: 'switch'|'socket'|'panel', description: string[], images, catalog?, order, legacyCategoryId }`
  - `productSchema`、`Product`、`Category` 型別不變名

- [ ] **Step 1: 改寫 `shared/schema.ts`**

```ts
import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string(), order: z.number().int(), cover: z.string().optional(), description: z.string().optional(),
});
export const lightSchema = z.object({
  kind: z.literal('light'), model: z.string(),
  // 舊站確實存在沒有任何規格欄位的產品，故 watt 為選填。
  watt: z.number().positive().optional(),
  beamAngle: z.array(z.number()).default([]),
  cct: z.array(z.number()).default([]), cri: z.number().optional(), cutoutDia: z.number().optional(),
  dimensions: z.string().optional(), voltage: z.string().optional(), socket: z.string().optional(),
  colors: z.array(z.string()).default([]),
  images: z.array(z.string()).min(1), catalog: z.string().optional(), order: z.number().int().default(999), legacyId: z.number().int(),
});
export const switchSchema = z.object({
  kind: z.literal('switch'), model: z.string(), series: z.enum(['unica', 'zencelo']),
  type: z.enum(['switch', 'socket', 'panel']),
  // 舊站開關描述格式不一致，原樣保留而不強行結構化。
  description: z.array(z.string()).default([]),
  images: z.array(z.string()).min(1), catalog: z.string().optional(), order: z.number().int().default(999), legacyCategoryId: z.number().int(),
});
export const productSchema = z.discriminatedUnion('kind', [lightSchema, switchSchema]);
export type Product = z.infer<typeof productSchema>;
export type Light = z.infer<typeof lightSchema>;
export type Switch = z.infer<typeof switchSchema>;
export type Category = z.infer<typeof categorySchema>;
```

- [ ] **Step 2: 刪除示範資料**

```bash
rm -rf site/src/content/products
mkdir -p site/src/content/products
rm -f site/public/products/*.svg
```

- [ ] **Step 3: 更新 `site/src/components/ProductCard.astro`**

把 `<p>` 內的摘要字串改成能容忍缺漏欄位、且不再引用 `gang`／`amperage`：

```astro
---
import { siteUrl } from '../lib/url';
import { productUrl } from '../lib/catalog'; const { product }=Astro.props; const d=product.data;
const summary = d.kind==='light'
  ? [d.watt?`${d.watt}W`:null, d.cct.length?`${d.cct.join(' / ')}K`:null, d.cutoutDia?`孔徑 ${d.cutoutDia}mm`:null, d.socket??null].filter(Boolean).join(' · ') || '規格待補'
  : [d.series.toUpperCase(), d.description[0]].filter(Boolean).join(' · ');
---
<article style="background:white;border:1px solid var(--color-line);transition:.2s"><a href={productUrl(d.model)} style="text-decoration:none"><img src={siteUrl(d.images[0])} alt={`${d.model} 產品圖`} width="600" height="600" loading="lazy" style="display:block;width:100%;aspect-ratio:1;object-fit:contain"/><div style="padding:1rem"><strong class="mono">{d.model}</strong><p style="color:var(--color-muted);margin:.5rem 0 0">{summary}</p></div></a><label style="display:block;padding:1rem"><input type="checkbox" data-compare={d.model}/> 加入比較 <span class="sr-only">{d.model}</span></label></article>
```

- [ ] **Step 4: 更新 `site/src/components/Catalog.astro` 的篩選群組**

把 `groups` 陣列中最後三列（`switchType`、`finish`、`gang`）換成下列兩列，其餘不動：

```ts
  ['switchType','開關類型',[['switch','開關'],['socket','插座'],['panel','面板']]],
  ['socket','燈座',[...new Set(items.flatMap(p=>p.data.kind==='light'&&p.data.socket?[p.data.socket]:[]))].sort().map(x=>[x,x])],
```

- [ ] **Step 5: 更新 `site/src/scripts/filter.ts`**

把這三行：

```ts
    visible &&= matches('switchType',!light?p.path:[]);
    visible &&= matches('finish',!light?p.finish:[]);
    visible &&= matches('gang',!light&&p.gang?[String(p.gang)]:[]);
```

換成：

```ts
    visible &&= matches('switchType',!light?[p.type]:[]);
    visible &&= matches('socket',light&&p.socket?[p.socket]:[]);
```

並把 watt 那行改為容忍缺漏：

```ts
    visible &&= matches('watt',light&&p.watt?[p.watt<10?'under10':p.watt<20?'10to20':p.watt<30?'20to30':'30plus']:[]);
```

- [ ] **Step 6: 更新 `site/src/scripts/compare.ts` 的 `specifications()`**

```ts
function specifications(product: Product): Record<string, string> {
  if (product.kind === 'light') return {
    '種類': '燈具', '功率': product.watt ? `${product.watt}W` : '—', '孔徑': product.cutoutDia ? `${product.cutoutDia}mm` : '—',
    '色溫': product.cct.map(value => `${value}K`).join(' / ') || '—', '演色性': product.cri ? `CRI ${product.cri}` : '—',
    '角度': product.beamAngle.map(value => `${value}°`).join(' / ') || '—', '顏色': product.colors.join('、') || '—',
    '燈座': product.socket || '—', '尺寸': product.dimensions || '—', '電壓': product.voltage || '—',
  };
  const typeName = { switch: '開關', socket: '插座', panel: '面板' }[product.type];
  return { '種類': '開關面板', '系列': product.series.toUpperCase(), '類型': typeName, '說明': product.description.join('；') || '—' };
}
```

- [ ] **Step 7: 更新 `site/src/pages/p/[model].astro` 的規格 `<dl>`**

把 `<dl>` 內的三元運算換成：

```astro
{d.kind==='light'?<><dt>功率</dt><dd>{d.watt?`${d.watt}W`:'—'}</dd><dt>色溫</dt><dd>{d.cct.length?d.cct.map(x=><span class="btn" style="padding:.2rem .5rem;margin:.15rem">{x}K</span>):'—'}</dd><dt>演色性</dt><dd>{d.cri?`CRI ${d.cri}`:'—'}</dd><dt>孔徑</dt><dd>{d.cutoutDia?`${d.cutoutDia}mm`:'—'}</dd><dt>角度</dt><dd>{d.beamAngle.length?`${d.beamAngle.join('° / ')}°`:'—'}</dd><dt>燈座</dt><dd>{d.socket??'—'}</dd><dt>顏色</dt><dd>{d.colors.join('、')||'—'}</dd><dt>尺寸</dt><dd>{d.dimensions??'—'}</dd><dt>電壓</dt><dd>{d.voltage??'—'}</dd></>:<><dt>系列</dt><dd>{d.series.toUpperCase()}</dd><dt>類型</dt><dd>{({switch:'開關',socket:'插座',panel:'面板'})[d.type]}</dd><dt>說明</dt><dd>{d.description.length?<ul style="margin:0;padding-left:1.2rem">{d.description.map(line=><li>{line}</li>)}</ul>:'—'}</dd></>}
```

- [ ] **Step 8: 執行 typecheck 確認契約一致**

```bash
pnpm typecheck
```

預期：PASS。內容集合此時為空，`astro sync` 仍應成功。若出現 `finish`／`gang`／`amperage` 相關錯誤，表示仍有未更新的引用，逐一修正。

- [ ] **Step 9: Commit**

```bash
git add shared/schema.ts site/src site/public/products
git commit -m "refactor: align product contract with legacy site data shape"
```

---

### Task 7: parse 階段與人工驗收報告

**Files:**
- Modify: `tools/scraper/src/parse.ts`（整份取代既有的 throw）
- Create: `tools/scraper/data/.gitkeep`
- Test: `tools/scraper/test/parse.test.ts`

**Interfaces:**
- Consumes: `parseLightDetail`（Task 4）、`parseSwitchList`（Task 5）、`LIGHT_CATEGORIES`、`SWITCH_CATEGORIES`（Task 2）、snapshot（Task 3）
- Produces:
  - `tools/scraper/data/lights.json`：`Array<LightRecord & { categoryLegacyId: number }>`
  - `tools/scraper/data/switches.json`：`SwitchRecord[]`
  - `tools/scraper/report.md`
  - `buildReport(input: { lights: ...[]; switches: SwitchRecord[]; missingImages: string[] }): string`

- [ ] **Step 1: 寫失敗的測試**

`tools/scraper/test/parse.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../src/parse.ts';

test('報告列出無規格產品', () => {
  const report = buildReport({
    lights: [{ legacyId: 238, model: '', beamAngle: [], cct: [], colors: [], images: ['a.png'], unknownLabels: [], categoryLegacyId: 42 }],
    switches: [], missingImages: [],
  });
  assert.match(report, /238/);
  assert.match(report, /無規格|缺少型號/);
});

test('報告列出重複型號', () => {
  const base = { series: 'unica' as const, type: 'switch' as const, description: [], images: ['x.JPG'], legacyCategoryId: 578 };
  const report = buildReport({ lights: [], switches: [{ ...base, model: '010102' }, { ...base, model: '010102' }], missingImages: [] });
  assert.match(report, /重複型號/);
  assert.match(report, /010102/);
});

test('報告列出未知標籤', () => {
  const report = buildReport({
    lights: [{ legacyId: 500, model: 'GB-X', beamAngle: [], cct: [], colors: [], images: ['a.png'], unknownLabels: ['保固年限'], categoryLegacyId: 42 }],
    switches: [], missingImages: [],
  });
  assert.match(report, /保固年限/);
});

test('完全乾淨的資料產生無待辦的報告', () => {
  const report = buildReport({
    lights: [{ legacyId: 120, model: 'GB-DMR-2060-1', watt: 9, beamAngle: [20], cct: [3000], colors: ['白'], images: ['a.png'], unknownLabels: [], categoryLegacyId: 42 }],
    switches: [], missingImages: [],
  });
  assert.match(report, /無待處理項目/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`parse.ts` 目前會直接 throw。

- [ ] **Step 3: 實作 `src/parse.ts`**

```ts
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLightDetail, type LightRecord } from './parse-light.ts';
import { parseSwitchList, type SwitchRecord } from './parse-switch.ts';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { snapshotName, lightListUrl, switchListUrl, lightDetailUrl } from './urls.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = join(root, 'snapshot');

export type LightRow = LightRecord & { categoryLegacyId: number };

export function buildReport(input: { lights: LightRow[]; switches: SwitchRecord[]; missingImages: string[] }): string {
  const lines: string[] = ['# 舊站資料解析報告', '', `產生時間：${new Date().toISOString()}`, '', `燈具 ${input.lights.length} 件、開關 ${input.switches.length} 件。`, ''];
  const issues: string[] = [];

  const noSpec = input.lights.filter(row => !row.model || (row.watt === undefined && row.socket === undefined && row.cct.length === 0));
  if (noSpec.length) issues.push(['## 無規格或缺少型號', '', ...noSpec.map(row => `- legacyId ${row.legacyId}（型號「${row.model || '空白'}」）需人工補齊`), ''].join('\n'));

  const unknown = input.lights.filter(row => row.unknownLabels.length > 0);
  if (unknown.length) issues.push(['## 未知標籤', '', ...unknown.map(row => `- legacyId ${row.legacyId}：${row.unknownLabels.join('、')}`), ''].join('\n'));

  const all = [...input.lights.map(row => row.model), ...input.switches.map(row => row.model)].filter(Boolean);
  const duplicates = [...new Set(all.filter((model, index) => all.indexOf(model) !== index))];
  if (duplicates.length) issues.push(['## 重複型號', '', ...duplicates.map(model => `- ${model}`), ''].join('\n'));

  const noImage = [...input.lights, ...input.switches].filter(row => row.images.length === 0);
  if (noImage.length) issues.push(['## 無圖片', '', ...noImage.map(row => `- ${row.model || ('legacyId' in row ? row.legacyId : '?')}`), ''].join('\n'));

  if (input.missingImages.length) issues.push(['## snapshot 缺少的圖檔', '', ...input.missingImages.map(name => `- ${name}`), ''].join('\n'));

  return [...lines, ...(issues.length ? issues : ['無待處理項目。', ''])].join('\n');
}

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
const pageAt = async (url: string) => readFile(join(snapshot, 'pages', `${snapshotName(url)}.html`), 'utf8');
const pageExists = (url: string) => exists(join(snapshot, 'pages', `${snapshotName(url)}.html`));

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
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：全部 PASS。

- [ ] **Step 5: 執行 parse 並閱讀報告**

```bash
cd tools/scraper && pnpm parse && cat report.md
```

預期：燈具 137、開關 57。逐項閱讀報告；「無規格」與「未知標籤」若確實是舊站缺資料，記錄於報告即可，不得捏造規格填補。

- [ ] **Step 6: Commit**

```bash
git add tools/scraper/src/parse.ts tools/scraper/test/parse.test.ts tools/scraper/data tools/scraper/report.md
git commit -m "feat(scraper): parse snapshot into structured data with review report"
```

---

### Task 8: 圖片轉檔與 emit

**Files:**
- Create: `tools/scraper/src/images.ts`
- Modify: `tools/scraper/src/emit.ts`（整份取代既有的 throw）
- Test: `tools/scraper/test/images.test.ts`

**Interfaces:**
- Consumes: `data/lights.json`、`data/switches.json`（Task 7）、`LIGHT_CATEGORIES`、`SWITCH_CATEGORIES`（Task 2）、`productSchema`（Task 6）、`modelSlug`
- Produces:
  - `imageName(model: string, index: number): string` — 例如 `gb-dmr-2060-1-1.webp`
  - `site/src/content/products/**/index.json`、`**/_category.json`
  - `site/public/products/*.webp`

- [ ] **Step 1: 寫失敗的測試**

`tools/scraper/test/images.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageName } from '../src/images.ts';

test('圖片檔名為 ASCII 且依型號與序號', () => {
  assert.equal(imageName('GB-DMR-2060-1', 0), 'gb-dmr-2060-1-1.webp');
  assert.equal(imageName('GB-DMR-2060-1', 2), 'gb-dmr-2060-1-3.webp');
});

test('含中文或空白的型號被轉為 ASCII', () => {
  assert.match(imageName('010102', 0), /^[a-z0-9-]+\.webp$/);
  assert.match(imageName('GB TR 3012', 0), /^[a-z0-9-]+\.webp$/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
cd tools/scraper && pnpm test
```

預期：FAIL，`Cannot find module '../src/images.ts'`。

- [ ] **Step 3: 實作 `src/images.ts`**

```ts
import sharp from 'sharp';
import { modelSlug } from '@glory-bright/shared/slug';

export function imageName(model: string, index: number): string {
  return `${modelSlug(model)}-${index + 1}.webp`;
}

/** 維持舊站原始尺寸，不放大 —— 舊站只有 200×200／300×300，放大只會糊化。 */
export async function toWebp(source: string, destination: string): Promise<void> {
  await sharp(source).webp({ quality: 88 }).toFile(destination);
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
cd tools/scraper && pnpm test
```

預期：PASS。

- [ ] **Step 5: 實作 `src/emit.ts`（整份取代既有的 throw）**

```ts
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productSchema, categorySchema } from '@glory-bright/shared/schema';
import { modelSlug } from '@glory-bright/shared/slug';
import { LIGHT_CATEGORIES, SWITCH_CATEGORIES } from './taxonomy.ts';
import { imageName, toWebp } from './images.ts';
import type { LightRow } from './parse.ts';
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

await mkdir(publicRoot, { recursive: true });
const models = new Set<string>();
const failures: string[] = [];

async function emitImages(model: string, files: string[]): Promise<string[]> {
  const written: string[] = [];
  for (const [index, file] of files.entries()) {
    const source = join(root, 'snapshot', 'images', file);
    if (!await exists(source)) { failures.push(`${model}：snapshot 缺少圖檔 ${file}`); continue; }
    const name = imageName(model, written.length);
    await toWebp(source, join(publicRoot, name));
    written.push(`/products/${name}`);
  }
  return written;
}

// 分類 _category.json
const lightParents = new Map(LIGHT_CATEGORIES.map(c => [c.parentSlug, c]));
await writeJson(join(contentRoot, 'lights', '_category.json'), categorySchema.parse({ name: '燈具', order: 1, description: '依空間與開孔尺寸選擇專業照明' }));
await writeJson(join(contentRoot, 'switches', '_category.json'), categorySchema.parse({ name: '開關面板', order: 2, description: 'Schneider Electric UNICA 與 ZENcelo 系列' }));
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
  if (models.has(model)) { failures.push(`型號重複：${model}`); continue; }
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
  const category = SWITCH_CATEGORIES.find(item => item.legacyId === row.legacyCategoryId)!;
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

console.log(`匯出完成：${models.size} 件產品。`);
if (failures.length > 0) { console.error('\n需人工處理：'); failures.forEach(line => console.error(`  ${line}`)); process.exitCode = 1; }
```

- [ ] **Step 6: 執行 emit**

```bash
cd tools/scraper && pnpm emit
```

預期：印出匯出件數。若列出「需人工處理」，逐項確認；`型號重複` 必須解決（否則 `/p/[model]` 建置會丟例外）。

- [ ] **Step 7: 驗證建置**

```bash
pnpm typecheck && pnpm build
```

預期：兩者皆 PASS。`site/dist/p/` 底下的目錄數應等於匯出件數。

```bash
ls site/dist/p | wc -l
```

- [ ] **Step 8: Commit**

```bash
git add tools/scraper/src/images.ts tools/scraper/src/emit.ts tools/scraper/test/images.test.ts site/src/content/products site/public/products
git commit -m "feat: import legacy catalog into content collections"
```

---

### Task 9: 最新消息與聯絡資訊

**Files:**
- Create: `site/src/content/news/*.md`（4 則）
- Delete: `site/src/content/news/website-renewal.md`（若內容與新 mock 重複）
- Modify: `site/src/components/Footer.astro`

**Interfaces:**
- Consumes: `news` collection schema（`title: string`、`date: Date`、`cover?: string`、`draft: boolean`）
- Produces: 4 篇 Markdown 消息

- [ ] **Step 1: 建立 4 則 mock 消息**

內容為通用營運公告，**不得杜撰具體數字、獎項、客戶名稱或合作對象**。

`site/src/content/news/website-renewal.md`（沿用既有檔名，改寫內容）：

```markdown
---
title: 官方網站改版上線
date: 2026-09-01
draft: false
---

榮輝照明科技的官方網站完成改版。新版網站重新整理了燈具與開關面板的分類結構，並新增型號搜尋、規格篩選與最多三項產品的規格比較功能，方便設計師與工程夥伴快速查找所需規格。

（此為示範內容，正式上線前需由業主替換。）
```

`site/src/content/news/catalog-structure-update.md`：

```markdown
---
title: 產品型錄分類調整
date: 2026-08-15
draft: false
---

因應產品線調整，燈具分類重新整理為崁燈、軌道燈、吸頂懸吊燈、線型燈與辦公工程照明五大類；開關面板則依 UNICA 與 ZENcelo 兩個系列區分開關、插座與面板。

（此為示範內容，正式上線前需由業主替換。）
```

`site/src/content/news/spec-inquiry-channel.md`：

```markdown
---
title: 規格諮詢與報價聯絡方式
date: 2026-07-20
draft: false
---

專案規格諮詢與報價需求，歡迎透過電話或 E-mail 與我們聯繫。提供案場條件與需求數量，將有專人協助規格建議。

（此為示範內容，正式上線前需由業主替換。）
```

`site/src/content/news/lighting-application-notes.md`：

```markdown
---
title: 照明應用選型說明
date: 2026-06-10
draft: false
---

選用崁燈時，建議先確認天花板的埋入孔徑與開孔尺寸，再依空間用途選擇色溫與演色性。商業空間的重點照明可搭配軌道燈調整照射角度，間接照明則適合使用線型燈。

（此為示範內容，正式上線前需由業主替換。）
```

- [ ] **Step 2: 更新 `site/src/components/Footer.astro` 的聯絡資訊**

把「聯絡資訊」區塊改為包含傳真與 E-mail，「服務據點」維持待確認：

```astro
<footer style="background:#1a1a1a;color:white;margin-top:5rem;padding:3rem 0"><div class="wrap" style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))"><section><h2 class="mono">GLORY BRIGHT</h2><p>榮輝照明科技有限公司</p><p>Schneider UNICA / ZENcelo 代理品牌</p></section><section><h2>聯絡資訊</h2><p><a href="tel:0226328828">電話 (02) 2632-8828</a></p><p>傳真 (02) 2632-8728</p><p><a href="mailto:glory.bright@msa.hinet.net">glory.bright@msa.hinet.net</a></p></section><section><h2>服務據點</h2><p>地址待業主確認</p></section></div></footer>
```

註：移除原本指向 `https://maps.google.com` 的連結 —— 地址尚未確認，該連結導向 Google Maps 首頁而非實際據點，沒有作用。

- [ ] **Step 3: 驗證建置**

```bash
pnpm build && ls site/dist/news
```

預期：`site/dist/news/` 下有 4 個消息目錄與 `index.html`。

- [ ] **Step 4: Commit**

```bash
git add site/src/content/news site/src/components/Footer.astro
git commit -m "feat: add placeholder news entries and complete footer contact details"
```

---

### Task 10: 文件更新與最終驗證

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/HANDOVER.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 `docs/DECISIONS.md`**

把「暫存示範產品」那條換掉，並補上這次的決策：

```markdown
# 設計決策

- 使用 Astro 靜態輸出與公開 GitHub Pages，沒有後端、表單或第三方 API。
- 產品 URL 以型號維持扁平 `/p/{model}/`；分類路由保留階層。
- 產品資料由 `tools/scraper` 自舊站 `www.glory-bright.com.tw` 遷移而來，snapshot 為冷備份並隨 repo 保存。
- 不匯入舊站售價。舊站售價為 2020 年資料，且新站定位為無報價、無購物車的型錄。
- 開關面板以舊站圖片料號（如 `010102`）作為型號，因舊站開關無型號欄位與明細頁。
- 開關描述原樣保留為字串陣列，不強行結構化；舊站描述格式不一致，硬解會誤判。
- 跳過舊站 0 件的子分類「光源／1121321」與「懸吊式」；軌道燈下的「盒_燈」「模組式_」正名為「盒燈」「模組式」。
- 產品圖沿用舊站原始尺寸轉為 WebP，不放大；待業主提供高解析原圖後替換。
- 地址以「待業主確認」呈現。舊站頁尾與聯絡頁的地址互相矛盾，不在公開站二選一。
- `site/src/content/news/` 目前 4 則為示範內容，正式網域上線前必須由業主替換。
```

- [ ] **Step 2: 更新 `docs/HANDOVER.md`**

在「新增產品」段之後插入資料遷移段落，並改寫「上線前必補項目」：

```markdown
## 資料遷移工具

`tools/scraper` 是三階段離線 pipeline：

- `pnpm --filter scraper crawl` — 抓取舊站存成 `tools/scraper/snapshot/`（冷備份，已在 repo 內）。舊站主機受 HiNet 流量管控，請求過密會回傳 `wfs.hinet.net` 攔截頁；crawler 會偵測並停止，等待數分鐘後重跑同一指令即可續抓。**除非舊站內容有更新，否則不需要再執行。**
- `pnpm --filter scraper parse` — 只讀 snapshot，產出 `data/*.json` 與 `report.md`。不發網路請求，可反覆執行。
- `pnpm --filter scraper emit` — 驗證 schema 後寫入 content collections 與 `site/public/products/` 的 WebP。
- `pnpm --filter scraper test` — 解析器的單元測試，fixture 直接取自 snapshot。

要調整解析規則時，只需改 `parse-light.ts` / `parse-switch.ts` 後重跑 `parse` 與 `emit`，不必再碰舊站。

## 上線前必補項目

- 由業主確認公司地址（舊站兩處地址不一致）、Logo SVG、Hero 情境照與型錄 PDF。
- 替換 `site/src/content/news/` 的 4 則示範消息。
- `tools/scraper/report.md` 內標示需人工補齊的產品規格，需向業主取得後補上。
- 產品圖目前沿用舊站小圖，建議取得高解析原圖後重新轉檔。
- 在 GitHub Pages 設為 GitHub Actions，完成 DNS 後啟用 HTTPS。
```

- [ ] **Step 3: 更新 `README.md`**

```markdown
# 榮輝照明靜態官網

Astro 靜態型錄網站。產品資料自舊站 `www.glory-bright.com.tw` 遷移而來，冷備份保存於 `tools/scraper/snapshot/`。詳見 `docs/HANDOVER.md`。
```

- [ ] **Step 4: 執行完整驗證**

```bash
pnpm --filter scraper test && pnpm typecheck && pnpm build
```

預期：測試全 PASS、typecheck PASS、build PASS。

- [ ] **Step 5: 驗證建置產物**

```bash
echo "產品頁：$(ls site/dist/p | wc -l)"
echo "分類頁：$(find site/dist/products -name index.html | wc -l)"
echo "消息頁：$(find site/dist/news -name index.html | wc -l)"
echo "產品圖：$(ls site/public/products/*.webp | wc -l)"
test -f site/dist/.nojekyll && echo ".nojekyll ✓"
grep -c "glory-bright" site/dist/sitemap-0.xml
```

預期：產品頁數等於 emit 匯出件數；消息頁 5（4 則 + index）；`.nojekyll` 存在。

- [ ] **Step 6: 瀏覽器實測**

```bash
pnpm --filter site dev
```

在 `http://localhost:4321/glory-bright/` 逐項確認：

1. 首頁、`/products/`、各層分類頁、任一產品頁皆正常顯示，圖片載入無破圖。
2. `/products/` 的篩選：勾選「埋入孔徑 60mm」後結果數下降且 URL 帶上 `cutout=60`；重新整理後條件保留。
3. 「開關類型」篩選的開關／插座／面板三個值都能正確過濾。
4. Header 型號搜尋輸入 `GB-DMR` 有即時結果。
5. 加入 3 項產品比較，比較表開啟且差異列有琥珀底色；加第 4 項時出現上限提示。
6. 鍵盤 Tab 可走完篩選、卡片、比較列；`Esc` 可關閉比較對話框。
7. 視窗縮到 375px：篩選面板堆疊、無水平捲動。
8. DevTools Console 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add docs/DECISIONS.md docs/HANDOVER.md README.md
git commit -m "docs: record migration decisions and scraper handover"
```

- [ ] **Step 8: 推送分支**

```bash
git push -u origin feature/legacy-site-migration
```

---

## Self-Review 紀錄

**Spec 覆蓋檢查：**

| Spec 要求 | 對應 Task |
| --- | --- |
| 三階段 pipeline、crawl 節流與 snapshot 閘門 | Task 1、3 |
| HiNet 攔截偵測 | Task 1（`isInterceptPage`）、Task 3（crawl 中斷續跑） |
| 標籤正規化與別名表 | Task 2 |
| 分類重建、跳過空分類、底線命名正名 | Task 2（taxonomy）、Task 8（emit `_category.json`） |
| `lightSchema` 的 `watt` optional、新增 `socket` | Task 6 |
| `switchSchema` 重寫、不含 price | Task 5（解析濾除售價）、Task 6（schema） |
| 開關以料號為型號 | Task 5 |
| `report.md` 人工驗收清單 | Task 7 |
| 圖片轉 WebP、不放大、ASCII 檔名 | Task 8 |
| 刪除示範產品 | Task 6 Step 2 |
| 聯絡資訊更新、地址維持待確認 | Task 9 |
| 4 則 mock 消息並標示為示範資料 | Task 9、Task 10 |
| 驗證標準（build、typecheck、瀏覽器實測） | Task 10 |

**型別一致性：** `LightRecord`（Task 4）→ `LightRow = LightRecord & { categoryLegacyId }`（Task 7）→ `emit` 消費（Task 8）名稱一致；`SwitchRecord`（Task 5）欄位 `legacyCategoryId` 與 `switchSchema`（Task 6）一致；`snapshotName` 產生的檔名在 Task 3 寫入、Task 4／5／7 讀取時格式一致。

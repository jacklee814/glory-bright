# 榮輝照明靜態型錄網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 Astro 建立可在 GitHub Pages 發布的榮輝照明 B2B 靜態型錄網站。

**Architecture:** `site` 是無框架的 Astro 網站，所有產品與消息在建置時讀取 Content Collections。產品明細採扁平型號 URL，分類頁採 catch-all 路由；篩選、型號搜尋與比較只在瀏覽器端漸進增強，不呼叫外部 API。

**Tech Stack:** Astro 5、TypeScript strict、Tailwind CSS 4、Zod 3、pnpm 9、Vanilla TypeScript。

## Global Constraints

- 不使用 React、Vue、UI library、CMS、資料庫、表單服務或前端框架。
- 不新增規格書未列出的相依套件；只使用 Astro、Tailwind、Zod、Sharp、Cheerio。
- 網址以 `/` 為 base、全部尾隨 `/`，網站正式網域為 `https://www.glory-bright.com.tw`。
- 圖片、資料夾與檔名使用 ASCII slug；產品資料須通過共用 Zod schema。
- 無聯絡頁、會員、購物車、報價、表單、第三方 API 或舊網址 redirect。

---

### Task 1: 建立 workspace、資料契約與示範資料

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `shared/package.json`, `shared/schema.ts`, `shared/slug.ts`
- Create: `site/package.json`, `site/astro.config.mjs`, `site/tsconfig.json`, `site/src/content/config.ts`
- Create: `site/src/content/products/**`, `site/src/content/news/**`

- [ ] 定義 `Category`、`Light`、`Switch` 的 Zod schema 與 `modelSlug()`，並讓 Astro Content Collections 直接重用 schema。
- [ ] 加入有完整分類路徑的代表性燈具與開關 JSON，讓所有路由與互動可於沒有爬站結果時完整演示。
- [ ] 執行 `pnpm install`、`pnpm --filter site build` 與 `pnpm --filter site typecheck`。
- [ ] Commit: `chore: scaffold Astro catalog workspace`。

### Task 2: 建立設計系統與共用外殼

**Files:**
- Create: `site/src/styles/global.css`, `site/src/layouts/BaseLayout.astro`
- Create: `site/src/components/{Header,Footer,MobileCallBar,Breadcrumbs,ProductCard}.astro`
- Create: `site/src/lib/{catalog,seo}.ts`

- [ ] 實作暖白、琥珀重點色、Noto Sans TC 與 IBM Plex Mono 的 token。
- [ ] 建立桌機 mega menu、手機抽屜、常駐型號搜尋、完整 footer 與手機固定撥號列。
- [ ] 建立可重用的 breadcrumbs、產品卡片與資料讀取工具，保留語意化標記與鍵盤可用性。
- [ ] 執行 build/typecheck 並 commit: `feat: add catalog shell and design system`。

### Task 3: 完成靜態資訊架構與產品頁

**Files:**
- Create: `site/src/pages/{index,products/[...slug],p/[model],news/index,news/[slug]}.astro`
- Create: `site/src/components/{FilterPanel,ProductGallery,ProductSpecs,RelatedProducts}.astro`

- [ ] 建立首頁、分類總覽和深度不固定的分類 catch-all 路由。
- [ ] 建立具唯一型號檢查的扁平產品頁、規格 dl、產品圖庫、型錄下載、電話/mailto 詢價與相關產品。
- [ ] 建立 Markdown 消息清單與消息單頁，隱藏 draft 並依日期排序。
- [ ] 執行建置後檢查 `dist` 內首頁、分類、產品、消息 URL，並 commit: `feat: add catalog pages and product details`。

### Task 4: 實作漸進增強互動

**Files:**
- Create: `site/src/scripts/catalog-controls.ts`, `site/src/components/CatalogControls.astro`
- Modify: `site/src/pages/products/[...slug].astro`, `site/src/components/{Header,ProductCard}.astro`

- [ ] 將精簡產品 filter rows 內嵌於頁面；無 JavaScript 時保留完整列表。
- [ ] 實作孔徑優先的燈具篩選、開關篩選、URL query 同步、選取 chip、即時結果數與手機篩選抽屜。
- [ ] 實作型號子字串搜尋、最多三筆 `sessionStorage` 比較清單、比較表與差異提示。
- [ ] 使用瀏覽器測試篩選、搜尋、比較、鍵盤操作與窄螢幕，然後 build/typecheck 並 commit: `feat: add catalog discovery controls`。

### Task 5: SEO、404、部署與交接

**Files:**
- Create: `site/public/{.nojekyll,CNAME,404.html,robots.txt}`, `.github/workflows/deploy.yml`
- Create: `docs/{HANDOVER,DECISIONS}.md`, `tools/scraper/package.json`, `tools/scraper/src/{crawl,parse,images,emit,taxonomy}.ts`
- Modify: `site/src/layouts/BaseLayout.astro`, `README.md`

- [ ] 加入每頁 canonical、description、Open Graph、Product/LocalBusiness/Breadcrumb JSON-LD、robots 與 sitemap。
- [ ] 建立可輸入型號的有用 404 頁，並加入 GitHub Pages workflow 與 `.nojekyll`。
- [ ] 建立不會呼叫舊站的 scraper 入口與明確的資料遷移／交接指引；真實爬取與資產匯入保留給冷備份完成後的人工資料驗收。
- [ ] 執行完整 build/typecheck、產物連結檢查及瀏覽器視覺/console/a11y 檢查，commit: `chore: prepare Pages deployment and handover`。

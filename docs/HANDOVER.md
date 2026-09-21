# 榮輝照明網站交接

## 本機開發

目前發布於 `https://jacklee814.github.io/glory-bright/`。Astro 的 `site` 為 `https://jacklee814.github.io`、`base` 為 `/glory-bright/`；站內連結和 public 圖片使用 `siteUrl()`。開發預覽也需使用 `/glory-bright/` 路徑。

取得自訂網域後，再一起更新 Astro `site`／`base`、robots sitemap、404 內的連結及 GitHub Pages 自訂網域設定，並加入對應 CNAME。尚未取得的網域不可先綁定。

執行 `pnpm install` 後，以 `pnpm --filter site dev` 開啟預覽；`pnpm --filter site build` 產生發布檔。

## 新增產品

在 `site/src/content/products/` 下依分類建立 ASCII slug 資料夾與 `index.json`。模型必須全站唯一；欄位由 `shared/schema.ts` 驗證。圖片應是 ASCII 檔名、白底 WebP，型錄放在 `site/public/catalogs/`。

手動編輯產品時請注意：`site/src/content/products/` 的內容會在下次執行 `pnpm --filter scraper emit` 時被整批重建。長期的人工修正應回寫到 scraper 的解析規則，而非只改輸出檔。

## 已排除的功能

本站**刻意不提供**產品篩選、產品比較與電話／E-mail 詢價 CTA。這是 2026-09-20 業主確認的範圍縮減，不是尚未實作的待辦。`docs/superpowers/plans/2026-09-20-static-catalog-site.md` 的 Task 4（漸進增強互動）已作廢，請勿依該計畫把功能加回來。

產品列表由 `site/src/components/ProductGrid.astro` 呈現，是不含互動控制項的純列表。分類階層本身就是收斂產品範圍的方式。Header 的型號搜尋不在縮減範圍內，仍然保留。

## 最新消息

`site/src/content/news/` 下的 Markdown，每則一個檔案。檔名格式為 `YYYY-MM-DD-slug.md`，日期前綴只用於排序與辨識，網址取後面的 slug（例如 `/news/website-launch/`）。

frontmatter 欄位：`title`（必填）、`date`（必填）、`image`（選填，站內路徑如 `/hero/xxx.webp`）、`draft`（選填，設為 `true` 則不會發布）。內文為純文字段落。

**目前 3 則為示範內容，正式上線前需由業主替換。**

## 資料遷移工具

`tools/scraper` 是三階段離線 pipeline：

- `pnpm --filter scraper crawl` — 抓取舊站存成 `tools/scraper/snapshot/`（冷備份，已在 repo 內）。**除非舊站內容有更新，否則不需要再執行。**
- `pnpm --filter scraper parse` — 只讀 snapshot，產出 `data/*.json` 與 `report.md`。不發網路請求，可反覆執行。
- `pnpm --filter scraper emit` — 驗證 schema 後寫入 content collections 與 `site/public/products/` 的 WebP。
- `pnpm --filter scraper test` — 解析器的單元測試，fixture 直接取自 snapshot。

要調整解析規則時，只需改 `parse-light.ts` / `parse-switch.ts` 後重跑 `parse` 與 `emit`，不必再碰舊站。

### 舊站主機的流量限制

舊站是 HiNet 虛擬主機上的 Apache 1.3.39，只支援 HTTP。請求過於密集時，主機會對來源 IP 回傳 HTTP 200 但內容為 `wfs.hinet.net` 攔截頁而非真實內容。`src/http.ts` 的 `isInterceptPage()` 會偵測此情況並視為失敗，crawler 遇到就停止，絕不會把攔截頁寫進 snapshot。

封鎖是 IP 層級的，換 User-Agent 無效。遇到時請等待一段時間後重跑 `crawl`；crawler 會跳過已抓到的頁面續抓。節流預設為每 3 秒一次請求，如果仍頻繁被擋，可調大 `src/http.ts` 的 `limiter` 間隔。

## 上線前必補項目

- 由業主確認公司地址（舊站頁尾與聯絡頁的地址不一致）、Logo SVG、Hero 情境照與型錄 PDF。
- `tools/scraper/report.md` 內標示需人工補齊的產品規格，需向業主取得後補上。
- 產品圖目前沿用舊站小圖（200×200／300×300），建議取得高解析原圖後重新轉檔。
- 在 GitHub Pages 設為 GitHub Actions，完成 DNS 後啟用 HTTPS。

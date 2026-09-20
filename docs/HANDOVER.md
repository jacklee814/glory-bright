# 榮輝照明網站交接

## 本機開發

執行 `pnpm install` 後，以 `pnpm --filter site dev` 開啟預覽；`pnpm --filter site build` 產生發布檔。

## 新增產品

在 `site/src/content/products/` 下依分類建立 ASCII slug 資料夾與 `index.json`。模型必須全站唯一；欄位由 `shared/schema.ts` 驗證。圖片應是 ASCII 檔名、白底 WebP，型錄放在 `site/public/catalogs/`。

## 上線前必補項目

- 由業主確認公司地址、Logo SVG、Hero 情境照與型錄 PDF。
- 先完成規格書 §5.1 的舊站冷備份，再實作實際爬蟲與人工驗收資料。
- 在 GitHub Pages 設為 GitHub Actions，完成 DNS 後啟用 HTTPS。

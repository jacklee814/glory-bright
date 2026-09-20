# 榮輝照明靜態官網：Phase 0 基礎骨架設計

## 目標

建立可交接、可部署至 GitHub Pages 的本機專案基礎，供後續資料遷移與 Astro 網站開發使用。本階段不爬取舊站、不建立產品頁或任何前端互動。

## 已確認決策

- GitHub repository 為公開的 `jacklee814/glory-bright`；公開性符合 GitHub Pages 免費方案的限制。
- 採用 pnpm workspace，工作區包含 `site`、`shared` 與 `tools/scraper`。
- 網站側預定使用 Astro 5、TypeScript strict、Tailwind CSS 4 與 Zod 3；不引入 React、Vue、UI library、CMS、資料庫或表單服務。
- GitHub Pages 必要的 `.nojekyll`、`CNAME` 與實用的 `404.html` 會在 `site/public/` 建立。`CNAME` 使用正式網域 `www.glory-bright.com.tw`。
- 尚未取得的 Logo、Hero 圖、產品資料、型錄 PDF 與已確認公司地址不以假資料混入正式內容；骨架只保留放置位置與文件說明。

## 檔案邊界

| 區域 | 職責 |
| --- | --- |
| `site/` | Astro 靜態網站與 GitHub Pages 發布產物的來源 |
| `shared/` | 網站和資料遷移工具共用的 schema、型號 slug 規則 |
| `tools/scraper/` | 未來離線解析舊站資料的獨立 workspace；本階段只建立入口與指令介面 |
| `docs/` | 交接、技術決策與本階段工作紀錄 |
| `.github/workflows/` | Pages build/deploy 與後續 PR 品質檢查 |

## 驗證標準

完成骨架後，`pnpm install`、`pnpm --filter site build` 及 TypeScript 型別檢查必須成功；build 產物需包含 `.nojekyll`、`CNAME` 和 404 頁。Git repository 的 `main` 分支應已連結至 `https://github.com/jacklee814/glory-bright`。

## 明確排除

- 不在此階段建立 GitHub Pages 設定、DNS、Cloudflare 或 HTTPS。
- 不下載或鏡像舊網站；規格要求的冷備份為下一個經確認的 Phase 0 子工作。
- 不建立產品假資料、圖片、PDF 或聯絡表單。

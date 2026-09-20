# 榮輝照明舊站資料遷移設計

## 目標

把 `http://www.glory-bright.com.tw/` 舊站的全部產品、分類與聯絡資訊遷移到新的 Astro 靜態型錄站，並留下可重跑、可驗收的離線 pipeline 與冷備份。

## 舊站盤點

伺服器為 Apache 1.3.39，無 `robots.txt`（未宣告任何爬取限制）。頁面編碼為 UTF-8 with BOM。導覽列以 PHP 頁面為主，AJAX 只用於未啟用的 `search.php`。

### 路由結構

| 區塊 | 路徑 | 規模 |
| --- | --- | --- |
| 燈具分類 | `category_light.php` → `category_light1.php?id=<中文>&act=goods` | 6 大類 |
| 燈具列表 | `goods_light.php?id=<N>&act=goods&page=<P>` | 15 子類 |
| 燈具明細 | `goods_light_list.php?id=<M>` | **137 件** |
| 開關分類 | `category_switch.php` → `category_switch1.php?id=<中文>` | 2 系列 |
| 開關列表 | `goods.php?id=<N>&act=goods&page=<P>` | 5 子類、**57 件**，**無明細頁** |
| 最新消息 | `news.php` → `news_list.php?id=124` | 1 則 |
| 聯絡我們 | `contact_us.php` | 含 POST 表單（新站已排除） |

燈具子類 id：42, 43, 44, 45, 46, 47, 50, 54, 55, 57, 58, 60, 62, 63, 65。
開關子類 id：578（UNICA開關）、579（UNICA插座）、581（ZENCELO開關）、582（ZENCELO插座）、597（UNICA歐規面板）。

### 資料品質問題

1. **欄位標籤不一致。** 同一語意有多種寫法：`使用電壓` / `輸 入 電 壓`、`演色性` / `演 色 性`（夾雜 U+2009 細空格）、`埋入孔徑` / `埋 入 孔 徑`、`材質顏色` / `材 質 顏 色`。
2. **規格缺漏。** 抽驗 12 筆中有 1 筆（`goods_light_list.php?id=238`）完全沒有任何規格欄位，只有圖片。
3. **未知欄位。** `id=191` 以 `燈座` 取代 `功率`，現有 schema 無對應欄位。
4. **空分類與測試資料。** 子類「1121321」（id=65）與「懸吊式」（id=58）皆 0 件；前者命名明顯是測試輸入。
5. **重複命名。** 軌道燈下的「盒_燈」「模組式_」帶底線，是為了避開與崁燈下同名子類的衝突。
6. **開關無結構化欄位。** 只有圖片（檔名為施耐德料號，如 `010102.JPG`）、自由格式描述行、與 2020 年的售價。
7. **聯絡地址自相矛盾。** 全站頁尾為「台北市內湖區康寧路三段265巷33號1F」，`contact_us.php` 為「台北市內湖區民權東路六段180巷6號5樓之12」。
8. **型錄下載為 `javascript:(#)`**，舊站並無型錄 PDF。

## 已確認決策

- **不匯入價格。** 舊站售價為 2020 年資料，且新站定位為無報價、無購物車的 B2B 型錄。爬蟲仍會把售價保留在 snapshot 內，日後需要時可再取用，但不進入 content collections。
- **開關以圖片料號作為型號。** `010102` 等料號具唯一性，產品 URL 為 `/p/010102/`。
- **全部匯入並清理髒資料。** 跳過 0 件的「光源/1121321」與「懸吊式」；軌道燈下的「盒_燈」「模組式_」正名為「盒燈」「模組式」（不同父層下 slug 不衝突）。
- **圖片照搬不放大。** 轉為 WebP、ASCII 檔名，維持舊站原始尺寸（200×200／300×300）。放大只會糊化，日後由業主提供高解析原圖再替換。
- **snapshot 全部進 git**，含 HTML 與圖片原檔（約 20MB）。冷備份的意義是舊站失效後仍可還原。
- **最新消息重做。** 舊站唯一一則（2020-01-21「預計2月初網站正式上架」）對新站已無意義，不遷移。改以全新 mock 消息填充版面。

## 架構：三階段離線 pipeline

沿用 `tools/scraper/` 既有的 `crawl` → `parse` → `emit` 形狀（亦即規格書 §5.1 要求）。核心理由是**解析規則必然要反覆調整，而調整期間不應再對舊站發出請求** — Apache 1.3.39 的老機器承受不起重複全站爬取，且 snapshot 本身就是要交付的冷備份。

### 階段一：`crawl`

**輸入：** 舊站 HTTP。**輸出：** `tools/scraper/snapshot/`。

- 節流 1 req/秒，單一 User-Agent，失敗重試上限 2 次。
- 抓取範圍：上述所有列表頁（含分頁）、137 個燈具明細頁、`news.php`、`contact_us.php`、以及所有引用到的產品圖原檔。
- snapshot 目錄已存在時直接拒絕執行，需明確帶 `--force` 才重爬。這道閘門避免誤觸重爬。
- HTML 原樣存檔（保留 BOM 與原始編碼），檔名由 URL 正規化而來。

### 階段二：`parse`

**輸入：** 僅 `tools/scraper/snapshot/`，不發出任何網路請求。**輸出：** `tools/scraper/data/*.json` 與 `tools/scraper/report.md`。

- 標籤正規化：比對前先 strip 所有 Unicode 空白（含 U+2009、全形空格），再過一張別名表映射到 schema 欄位。
- `report.md` 為人工驗收清單，列出：無任何規格的產品、出現未知標籤的產品、型號重複、圖片缺失。

### 階段三：`emit`

**輸入：** `tools/scraper/data/`。**輸出：** `site/src/content/products/**` 與 `site/public/products/`。

- 每筆產品先過 `@glory-bright/shared/schema` 驗證，任一筆失敗即整批中止並報告。
- 圖片以 Sharp 轉 WebP，不放大，檔名依型號 slug 產生 ASCII 名稱。
- 匯入前刪除現有 4 筆示範產品（`DECISIONS.md` 已載明不得視為正式資料）。

## 資料契約變更（`shared/schema.ts`）

這是本次唯一動到的跨模組介面，`site/src/content/config.ts` 直接重用，故兩側同步生效。

**`lightSchema`**
- `watt` 由必填改為 optional（舊站確實存在無規格產品）
- 新增 `socket?: string`（對應舊站「燈座」）
- 新增 `categoryPath: string[]`
- `legacyId` 保留，對應 `goods_light_list.php?id=<M>`

**`switchSchema`** — 重寫
- `model: string`（圖片料號，如 `010102`）
- `series: 'unica' | 'zencelo'`
- `type: 'switch' | 'socket' | 'panel'`
- `description: string[]`（原樣保留描述行，不強行解析）
- `images: string[]`（min 1）
- `legacyCategoryId: number`
- 移除舊站不存在的 `gang`、`amperage`、`finish` 必填限制
- **不含 `price` 欄位**

## 分類重建

```
lights/
  崁燈        { MR16型, AR111型, 泛光型, 盒燈, 模組式 }
  軌道燈      { MR_AR型, 盒燈, 模組式 }
  吸頂懸吊燈  { 吸頂式 }
  線型燈      { 鋁條燈, 軟帶燈 }
  辦公工程照明 { 辦公室照明, 工程照明 }
switches/
  unica       { 開關, 插座, 歐規面板 }
  zencelo     { 開關, 插座 }
```

跳過：`光源/1121321`（0 件、測試資料）、`吸頂懸吊燈/懸吊式`（0 件）。

## 站台內容更新

- **聯絡資訊：** 電話 (02)2632-8828、傳真 (02)2632-8728、Email glory.bright@msa.hinet.net 更新至 Footer。
- **地址：** 維持「待業主確認」。舊站兩處地址不一致，不在公開站二選一。
- **最新消息：** 建立 4 則全新 mock 消息以填充版面，內容為通用的營運公告（不杜撰具體數字、獎項或合作對象）。**必須在 `DECISIONS.md` 與 `HANDOVER.md` 標示為示範資料，正式網域上線前替換。**

## 驗證標準

- `pnpm --filter site build` 與 typecheck 通過。
- `dist` 內產品頁數量等於匯入筆數（燈具 137 + 開關 57，扣除解析失敗者）。
- `report.md` 內每一項皆已處理或已明確標記為可接受。
- 瀏覽器實測：在 194 筆資料規模下，篩選、型號搜尋、三筆比較、鍵盤操作與窄螢幕皆正常。
- snapshot 完整且可離線重跑 `parse` 與 `emit`。

## 明確排除

- 不匯入舊站聯絡表單或任何後端行為。
- 不建立舊網址到新網址的 redirect（原規格已排除）。
- 不匯入售價至 content collections。
- 不自行決定公司地址。
- 不產生型錄 PDF（舊站沒有）。

import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string(), order: z.number().int(), cover: z.string().optional(), description: z.string().optional(),
});

/**
 * 產品只保留網站實際需要的欄位：型號（標題）、圖片、排序，以及用於標示
 * LIGHTING／SWITCHES 的類別。
 *
 * 舊站的完整規格（功率、色溫、演色性、尺寸、描述、非標準欄位等）仍完整保存在
 * `tools/scraper/data/*.json` 與 `tools/scraper/snapshot/`，日後若要恢復顯示，
 * 在此補回欄位並調整 `emit.ts` 即可重新產生。
 */
export const productSchema = z.object({
  kind: z.enum(['light', 'switch']),
  model: z.string(),
  images: z.array(z.string()).min(1),
  order: z.number().int().default(999),
});

export type Product = z.infer<typeof productSchema>;
export type Category = z.infer<typeof categorySchema>;

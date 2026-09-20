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

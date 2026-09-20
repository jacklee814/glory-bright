import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string(), order: z.number().int(), cover: z.string().optional(), description: z.string().optional(),
});
export const lightSchema = z.object({
  kind: z.literal('light'), model: z.string(), watt: z.number().positive(), beamAngle: z.array(z.number()).default([]),
  cct: z.array(z.number()).default([]), cri: z.number().optional(), cutoutDia: z.number().optional(),
  dimensions: z.string().optional(), voltage: z.string().optional(), colors: z.array(z.string()).default([]),
  images: z.array(z.string()).min(1), catalog: z.string().optional(), order: z.number().int().default(999), legacyId: z.number().int(),
});
export const switchSchema = z.object({
  kind: z.literal('switch'), model: z.string(), series: z.enum(['unica', 'zencelo']), finish: z.array(z.string()).default([]),
  gang: z.number().int().optional(), amperage: z.string().optional(), images: z.array(z.string()).min(1), catalog: z.string().optional(), order: z.number().int().default(999), legacyId: z.number().int(),
});
export const productSchema = z.discriminatedUnion('kind', [lightSchema, switchSchema]);
export type Product = z.infer<typeof productSchema>;
export type Category = z.infer<typeof categorySchema>;

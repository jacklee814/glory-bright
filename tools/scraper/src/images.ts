import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { modelSlug } from '@glory-bright/shared/slug';

/** 型號理應為 ASCII（GB-xxx 或施耐德料號），非 ASCII 時退回雜湊以保證檔名可用且唯一。 */
export function imageName(model: string, index: number): string {
  const slug = modelSlug(model) || `item-${createHash('sha1').update(model).digest('hex').slice(0, 8)}`;
  return `${slug}-${index + 1}.webp`;
}

/** 維持舊站原始尺寸，不放大 —— 舊站只有 200×200／300×300，放大只會糊化。 */
export async function toWebp(source: string, destination: string): Promise<void> {
  await sharp(source).webp({ quality: 88 }).toFile(destination);
}

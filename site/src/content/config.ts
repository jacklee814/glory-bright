import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { productSchema, categorySchema } from '@glory-bright/shared/schema';
export const collections = {
  products: defineCollection({ loader: glob({ pattern: '**/[^_]*/index.json', base: './src/content/products' }), schema: productSchema }),
  categories: defineCollection({ loader: glob({ pattern: '**/_category.json', base: './src/content/products' }), schema: categorySchema }),
  /* 最新消息由人工在 site/src/content/news/ 維護，不經 scraper。 */
  news: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
    schema: z.object({
      title: z.string(),
      date: z.coerce.date(),
      image: z.string().optional(),
      draft: z.boolean().default(false),
    }),
  }),
};

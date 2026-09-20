import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { productSchema, categorySchema } from '@glory-bright/shared/schema';
export const collections = {
  products: defineCollection({ loader: glob({ pattern: '**/[^_]*/index.json', base: './src/content/products' }), schema: productSchema }),
  categories: defineCollection({ loader: glob({ pattern: '**/_category.json', base: './src/content/products' }), schema: categorySchema }),
};

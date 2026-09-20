import { getCollection } from 'astro:content';
import { modelSlug } from '@glory-bright/shared/slug';
export const products = async () => (await getCollection('products')).sort((a,b) => a.data.order-b.data.order);
export const categories = async () => (await getCollection('categories')).sort((a,b) => a.data.order-b.data.order);
export const productUrl = (model:string) => `/p/${modelSlug(model)}/`;
export const categoryPath = (id:string) => id.replace(/\/_category$/, '');
export const categoryName = (id:string) => id.split('/').at(-2) ?? '';

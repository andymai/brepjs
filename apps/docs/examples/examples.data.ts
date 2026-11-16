import { catalog, type CatalogCategory } from '../.vitepress/exampleCatalog';

declare const data: CatalogCategory[];
export { data };

export default {
  load(): CatalogCategory[] {
    return catalog;
  },
};

// The playground's example library, read at build time. The docs render one
// page for each example from this, so the two sites cannot drift apart.
import { CATEGORIES } from '../../playground/src/lib/examples/index';
import { importedApi } from '../../playground/src/lib/examples/search';

export interface CatalogExample {
  id: string;
  label: string;
  description: string;
  categoryId: string;
  categoryLabel: string;
  /** Function names the example imports, as written in its code. */
  api: string[];
  lines: number;
}

export interface CatalogCategory {
  id: string;
  label: string;
  examples: CatalogExample[];
}

export const catalog: CatalogCategory[] = CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  examples: category.examples.map((example) => ({
    id: example.id,
    label: example.label,
    description: example.description,
    categoryId: category.id,
    categoryLabel: category.label,
    api: importedApi(example.code),
    lines: example.code.trimEnd().split('\n').length,
  })),
}));

export const exampleCode = new Map(
  CATEGORIES.flatMap((category) => category.examples.map((e) => [e.id, e.code] as const))
);

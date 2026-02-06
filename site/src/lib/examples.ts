export interface Example {
  id: string;
  title: string;
  description: string;
  category: string;
  code: string;
}

export const examples: Example[] = [];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}

/** IDs of examples to highlight on the landing page (visually diverse set). */
export const featuredExampleIds: string[] = [];

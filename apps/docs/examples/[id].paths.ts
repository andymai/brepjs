import { catalog, exampleCode } from '../.vitepress/exampleCatalog';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default {
  paths() {
    return catalog.flatMap((category) =>
      category.examples.map((example) => {
        const code = (exampleCode.get(example.id) ?? '').trimEnd();
        const functions = example.api.map((name) => `\`${name}\``).join(' ');
        const content = [
          `# ${example.label}`,
          '',
          `<ExampleFigure id="${example.id}" label="${escapeHtml(example.label)}" category="${escapeHtml(example.categoryLabel)}" :lines="${example.lines}" />`,
          '',
          `<p v-pre class="example-lede">${escapeHtml(example.description)}</p>`,
          '',
          '## Code',
          '',
          'This is the full program. The playground runs it in your browser without a change.',
          '',
          '<div data-no-playground>',
          '',
          '```ts',
          code,
          '```',
          '',
          '</div>',
          '',
          ...(functions ? ['## Functions used', '', functions, ''] : []),
        ].join('\n');
        return {
          params: {
            id: example.id,
            label: example.label,
            description: example.description,
            category: example.categoryLabel,
          },
          content,
        };
      })
    );
  },
};

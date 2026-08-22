export function renderSafeMarkdown(markdown: string): DocumentFragment;
export function createSafeMarkdownRenderer(dependencies: {
  markdownFactory: (options: Record<string, unknown>) => { validateLink: (value: string) => boolean; render(markdown: string): string };
  purifier: { sanitize(markup: string, options: Record<string, unknown>): DocumentFragment };
}): (markdown: string) => DocumentFragment;

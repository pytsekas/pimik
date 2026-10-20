import { describe, expect, it } from 'vite-plus/test';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
  it('escapes raw html such as script tags', () => {
    const html = renderMarkdown('hello <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders emphasis and paragraphs', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('links urls and adds rel to every link', () => {
    const html = renderMarkdown('see https://example.com and [x](https://example.org)');
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html).toContain('href="https://example.com"');
  });

  it('does not render javascript: links', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript:');
  });
});

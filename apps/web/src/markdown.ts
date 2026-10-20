import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true });

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((parts, index, options, _env, self) => self.renderToken(parts, index, options));

md.renderer.rules.link_open = (parts, index, options, env, self) => {
  parts[index]?.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(parts, index, options, env, self);
};

/** Renders post text. Raw HTML in the source is escaped, never passed through. */
export function renderMarkdown(source: string): string {
  return md.render(source);
}

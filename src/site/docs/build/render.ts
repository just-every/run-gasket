import { Marked } from 'marked'

// One Markdown file to static HTML, at build time. The level-1 heading becomes
// the page title; raw HTML is shown as text; headings get GitHub-style ids so
// links written for GitHub work on the site; `link` decides where each link goes.
// A numbered level-2 heading ("1. Install rer") is a step: its number sits on a
// disc and the step's content is grouped under it (the docs pick).

export type RenderedPage = { title: string; html: string; ids: string[]; problems: string[] }

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const decodeHtml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

export function githubSlugger() {
  const seen = new Map<string, number>()
  return (text: string) => {
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
    let slug = base, count = seen.get(base) ?? 0
    while (seen.has(slug)) slug = `${base}-${++count}`
    seen.set(base, count)
    seen.set(slug, 0)
    return slug
  }
}

export function renderMarkdown(markdown: string, link: (href: string) => string): RenderedPage {
  const slug = githubSlugger(), ids: string[] = [], problems: string[] = []
  let title = ''
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = decodeHtml(this.parser.parseInline(tokens, this.parser.textRenderer)).replace(/\s+/g, ' ').trim()
        if (depth === 1) {
          if (title) problems.push('has more than one level-1 heading')
          title = text
          return ''
        }
        const id = slug(text)
        ids.push(id)
        const step = depth === 2 ? text.match(/^(\d+)\.\s/) : null
        if (step) return `<h2 id="${id}" class="docs-step"><span class="docs-num">${step[1]}</span> ${this.parser.parseInline(tokens).replace(/^\d+\.\s+/, '')}</h2>\n`
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      code({ text }) {
        return `<div class="docs-code"><pre><code>${escapeHtml(text.replace(/\n$/, ''))}</code></pre><button class="docs-copy" type="button" hidden>Copy</button></div>\n`
      },
      html({ text }) {
        return escapeHtml(text)
      },
      link({ href, title: hint, tokens }) {
        return `<a href="${escapeHtml(link(href))}"${hint ? ` title="${escapeHtml(hint)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
      },
      image({ href }) {
        problems.push(`has an image (${href}); the docs publish text only`)
        return ''
      },
    },
  })
  const html = steps(marked.parse(markdown, { async: false }) as string)
    .replace(/<table>/g, '<div class="docs-table" role="region" tabindex="0" aria-label="Table"><table>')
    .replace(/<\/table>/g, '</table></div>')
  if (!title) problems.push('has no level-1 heading to title the page')
  return { title, html, ids, problems }
}

/** Each step heading and everything up to the next level-2 heading, as one section. */
function steps(html: string) {
  return html.split(/(?=<h2 )/).map(part => part.startsWith('<h2 id="') && part.includes(' class="docs-step"') ? `<section class="docs-step-section">${part}</section>\n` : part).join('')
}

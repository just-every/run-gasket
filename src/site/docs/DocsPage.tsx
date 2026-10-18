import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { DocsNav } from './DocsNav'
import { docsPage, docsPages, docsPath } from './pages'
import '../style'

/** One docs page: the navigation, the article rendered from the repository's Markdown at build time, and its neighbours. */
export function DocsPage({ slug }: { slug: string }) {
  const page = docsPage(slug)
  const at = docsPages.findIndex(entry => entry.slug === slug)
  const previous = docsPages[at - 1], next = docsPages[at + 1]
  return (
    <div className="site">
      <SiteHeader current="docs" />
      <div className="docs-shell">
        <DocsNav current={slug} />
        <main id="main" className="docs-main">
          <article className="docs-article" aria-labelledby="docs-title">
            <p className="eyebrow">{page.section}</p>
            <h1 id="docs-title">{page.title}</h1>
            <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
          </article>
          <nav className="docs-pager" aria-label="Previous and next">
            {previous ? <a className="card" href={docsPath(previous.slug)}><span>Previous</span>{previous.label}</a> : <span />}
            {next ? <a className="card docs-next" href={docsPath(next.slug)}><span>Next</span>{next.label}</a> : null}
          </nav>
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}

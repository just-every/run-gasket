import { repository } from '../links'
import { Brand } from './Brand'

/** The run site's header: the mark and Gasket, then Docs and Source. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="site-header">
      <Brand />
      <nav aria-label="Site">
        <a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
        <a href={repository}>Source</a>
      </nav>
    </header>
  )
}

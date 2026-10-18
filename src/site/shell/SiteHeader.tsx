import { repository } from '../links'
import { Brand } from './Brand'

/** The run site's header: the lockup, then Docs, Contract and Source in ultramarine. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        <nav aria-label="Site">
          <a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
          <a href="/contract">Contract</a>
          <a href={repository}>Source</a>
        </nav>
      </div>
    </header>
  )
}

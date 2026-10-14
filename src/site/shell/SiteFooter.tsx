import { licence, repository } from '../links'
import { Brand } from './Brand'

/** The run site's footer, one line: Gasket, then the licence, Docs and Source. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Brand />
      <nav aria-label="Footer">
        <a href={licence}>MIT licensed</a>
        <a href="/docs">Docs</a>
        <a href={repository}>Source</a>
      </nav>
    </footer>
  )
}

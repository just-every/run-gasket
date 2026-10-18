import { license, repository } from '../links'
import { Brand } from './Brand'

/** The run site's footer, one line set in type: the lockup and what Gasket is, then Docs, Source and the license. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Brand size={32} />
          <p>Free, open source maintenance management</p>
        </div>
        <nav aria-label="Footer">
          <a href="/docs">Docs</a>
          <a href={repository}>Source</a>
          <a href={license}>MIT licensed</a>
        </nav>
      </div>
    </footer>
  )
}

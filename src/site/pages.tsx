// The run site (run-gasket.com) `rer build --site` writes: the homepage with its Run
// action, /run, the docs from docs/*.md, /contract from CONTRACT.md and the not-found
// page. Every Run page string and command is in run.json; nothing here reads installation data.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { bindIds } from '../bind-ids'
import { withIcons } from '../icon-head'
import { identity } from '../identity'
import { DocsPage } from './docs/DocsPage'
import { docsPage, docsPages, docsPath } from './docs/pages'
import { Landing, landingScript } from './landing/Landing'
import run from './run.json'

const SHARE_IMAGE = `${identity.runSite}/site/share.jpg`
// Code cards get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"
// Base's shared pages (src/base, copied unchanged) print British "licence"; Gasket is a US product.
// A separator or arrow between words stays on the line before it, so no wrapped line starts with "·", "–" or "→".
const bindSeparators = (html: string) => html.replace(/>([^<]+)</g, (_, text: string) => `>${text.replace(/ ([·–—→])(?= )/g, '\u00a0$1').replace(/ ([·–—])$/, '\u00a0$1')}<`)
// Base writes long dates the British way ("17 October 2026"); a US page reads "Oct 17, 2026".
const usDates = (html: string) => html.replace(/\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g, (_, day: string, month: string, year: string) => `${month.slice(0, 3)} ${day}, ${year}`)
const usPage = (html: string) => bindIds(usDates(withIcons(html.replace('<html lang="en"', '<html lang="en-US"').replaceAll(`${run.licence} licence<`, `${run.licence} license<`))))

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const data: RunData = run
  const document = (title: string, description: string, body: ReactElement, script = '') => '<!doctype html>' + bindIds(bindSeparators(renderToStaticMarkup(
    <html lang="en-US">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#ffffff" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Gasket" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.ico" sizes="16x16 32x32" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/fonts/inter/inter-variable-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={identity.fonts} />
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}{script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}</body>
    </html>,
  )))
  return {
    pages: [
      { path: '/', html: document('Gasket · Ready for first shift', identity.tagline, <Landing />, landingScript) },
      { path: '/run', html: usPage(runPageHtml(identity, data, contract)) },
      ...(contract ? [{ path: '/contract', html: usPage(contractPageHtml(identity, data, contract)) }] : []),
      ...docsPages.map(page => ({ path: docsPath(page.slug), html: document(`${docsPage(page.slug).title} · Gasket docs`, page.summary, <DocsPage slug={page.slug} />, COPY) })),
      { path: '/404', html: usPage(siteNotFoundHtml(identity, data, contract)) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'apple-touch-icon.png'],
  }
}

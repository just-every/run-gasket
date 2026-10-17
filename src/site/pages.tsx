import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsPage } from './docs/DocsPage'
import { docsPage, docsPages, docsPath } from './docs/pages'
import { Landing } from './landing/Landing'
import run from './run.json'

/** The run site (run-gasket.com), built by `rer build --site`: the homepage, the Run page, the docs and a 404. */
export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const data: RunData = run
  const document = (title: string, description: string, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" href={identity.mark} />
        <link rel="preload" href="/fonts/geist/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={identity.fonts} />
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document('Gasket · Keep your equipment in service', 'Free, open source maintenance for the equipment a small team owns: asset register, preventive schedules, work orders, inspections, parts and downtime.', <Landing />) },
      { path: '/run', html: runPageHtml(identity, data, contract) },
      ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, data, contract) }] : []),
      ...docsPages.map(page => ({ path: docsPath(page.slug), html: document(`${docsPage(page.slug).title} · Gasket docs`, page.summary, <DocsPage slug={page.slug} />) })),
      { path: '/404', html: siteNotFoundHtml(identity, data, contract) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand'],
  }
}

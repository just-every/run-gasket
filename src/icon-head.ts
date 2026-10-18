// The tab icons every page carries, Base's included: the hand-set 16 and 32 px marks, the ICO and the touch icon.
export const ICONS = '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32"><link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'

/** Base's shared pages (src/base, copied unchanged) link only the full SVG mark as the icon; Gasket's pages use its own set. */
export const withIcons = (html: string) => html.replace(/<link rel="icon" href="[^"]*">/, ICONS)

/** The same for a served Base page, such as the Lobby at /. */
export async function withIconsResponse(response: Response): Promise<Response> {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  return new Response(withIcons(await response.text()), { status: response.status, statusText: response.statusText, headers: response.headers })
}

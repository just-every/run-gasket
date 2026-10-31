import { intervalPreparer } from './agent-interval-fixtures.mjs'
/** Disposable verification drives the same setup-token, first-run and membership lifecycle as installation. */
export default async function initialize({ request, origin, claim, displayName, returnTo, reviewers }) {
  const bootstrap = await request(new URL(claim.path, origin).href, { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: claim.token, displayName, returnTo, reviewers }) })
  if (bootstrap.status !== 303) throw new Error('Native bootstrap refused')
  const cookie = bootstrap.headers.getSetCookie().map(line => line.split(';', 1)[0]).join('; ')
  const send = async (path, body, form) => {
    const response = await request(new URL(path, origin).href, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: origin, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) })
    if (![200,303].includes(response.status)) throw new Error(`Native lifecycle refused ${path}: ${response.status}`)
    await response.body?.cancel()
  }
  await send('/setup', { confirm: 'yes' }, true)
  // Native currentActor links the claimed owner to the real maintenance member.
  const linked = await request(new URL('/api/gasket/me', origin).href, { headers: { Cookie: cookie } })
  if (!linked.ok) throw new Error('Native maintenance owner linking refused')
  await linked.body?.cancel()
  await send('/api/gasket/site.configure', { name: 'Synthetic maintenance workshop', timezone: 'America/New_York' })
  const preparer = await reviewers.initialize('interval-preparer', { cookie })
  intervalPreparer(preparer.cookie)
  return bootstrap
}

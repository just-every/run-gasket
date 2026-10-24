import { createMailSender } from './modules/mail/index.mjs'
import { isLoopbackHost } from './modules/operator-auth/loopback.mjs'

/** Local capabilities require an explicitly configured, exact loopback origin. */
export function localDevelopment(env) {
 if (env.AUTH_LOCAL !== 'true' || typeof env.AUTH_ORIGIN !== 'string') return false
 try {
  const url = new URL(env.AUTH_ORIGIN)
  return url.origin === env.AUTH_ORIGIN && !url.username && !url.password && ['http:', 'https:'].includes(url.protocol) && isLoopbackHost(url.hostname)
 } catch { return false }
}

// Demos and local runtimes use Base's development sender, which validates each
// message and silently suppresses it. Installations keep their real provider.
export function operatorMail(env) {
 if (env.RER_DEMO === '1' || localDevelopment(env)) return createMailSender({ provider: 'development', mode: 'development' })
 if (!env.MAIL_PROVIDER || env.MAIL_PROVIDER === 'development') return undefined
 return createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, relayUrl: env.MAIL_RELAY_URL, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) })
}

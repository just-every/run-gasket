import { demoEffect } from './modules/demo/index.mjs'
import { createMailSender } from './modules/mail/index.mjs'
import { createD1DevelopmentOutbox } from './modules/mail/src/development/index.mjs'

export function operatorMail(env) {
 const sender = env.MAIL_PROVIDER === 'development'
  ? env.AUTH_LOCAL === 'true' ? createMailSender({ provider: 'development', mode: 'development' }, { outbox: createD1DevelopmentOutbox({ db: env.DB }) }) : undefined
  : env.MAIL_PROVIDER ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }) : undefined
 return sender || env.RER_DEMO === '1' ? { send: message => demoEffect(() => sender.send(message), { status: 'development', provider: 'development', providerMessageId: null }) } : undefined
}

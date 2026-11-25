import type { MailSender } from './modules/operator-auth/index.mjs'
import type { Bindings } from './auth.server'
export const mailOffResult: Readonly<{ status: 'rejected'; provider: 'none'; providerMessageId: null; code: 'mail_off' }>
export function localDevelopment(env: Bindings): boolean
export function operatorMail(env: Bindings): MailSender | undefined

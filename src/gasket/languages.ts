import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, one, stmt } from './core'
import type { Input } from './input'
import { EN, ES, type IntakeKey } from './intake-catalog'

export const LOCALES = ['en-US', 'es-US'] as const
export type Locale = typeof LOCALES[number]
export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale)
export const languageOptions = [{ value: 'en-US', label: 'English (US)' }, { value: 'es-US', label: 'Español (EE. UU.)' }]
const human = (actor: Actor) => insist(actor.role !== 'agent' && !actor.service, 'forbidden', 403)
const owner = (actor: Actor) => { human(actor); insist(actor.role === 'owner', 'forbidden', 403) }
const live = (env: Bindings, actor: Actor, ownerOnly = false) => guard(env, 'access_ended',
  "EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id JOIN oa_sessions s ON s.operator_id=o.id WHERE m.id=? AND m.status='active' AND m.role!='agent' AND o.status='active' AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version" + (ownerOnly ? " AND o.role='owner'" : '') + ')',
  actor.id, actor.sessionId, Date.now())

export async function languagePreferences(env: Bindings, actor: Actor) {
  human(actor)
  const organization = (await one(env, 'SELECT locale FROM gk_language_settings WHERE singleton=1')).locale as Locale
  const preference = (await one(env, 'SELECT locale FROM gk_member_languages WHERE member_id=?', actor.id))?.locale as Locale | undefined
  return { organization, preference: preference ?? null, effective: preference ?? organization }
}

export async function saveLanguage(env: Bindings, actor: Actor, input: Input, organization = false) {
  human(actor); if (organization) owner(actor)
  input.only(['locale', 'returnTo'])
  const locale = input.text('locale', { optional: !organization, max: 10 })
  insist(isLocale(locale) || (!organization && locale === ''), 'invalid_language')
  await commit(env, [live(env, actor, organization), organization
    ? stmt(env, 'UPDATE gk_language_settings SET locale=? WHERE singleton=1', locale)
    : locale ? stmt(env, 'INSERT INTO gk_member_languages(member_id,locale) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET locale=excluded.locale', actor.id, locale)
    : stmt(env, 'DELETE FROM gk_member_languages WHERE member_id=?', actor.id)],
    { actor: actor.id, action: organization ? 'language.default' : 'language.preference', subject: organization ? 'site' : actor.id, detail: { locale: locale || null, site: 'primary' } })
  return { locale: locale || null }
}

/** An owner can maintain interface translations; an empty entry exercises the ordinary fallback. */
export async function saveIntakeTranslation(env: Bindings, actor: Actor, input: Input) {
  owner(actor); input.only(['key', 'value', 'reset', 'returnTo'])
  const key = input.text('key', { max: 80 }), value = input.text('value', { optional: true, max: 2000 })
  insist(Object.hasOwn(ES, key), 'invalid_translation_key')
  if (!input.flag('reset') && value) {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
    insist(placeholders(value) === placeholders(EN[key as IntakeKey]), 'invalid_translation_placeholders')
  }
  await commit(env, [live(env, actor, true), input.flag('reset')
    ? stmt(env, "DELETE FROM gk_intake_translations WHERE locale='es-US' AND key=?", key)
    : stmt(env, "INSERT INTO gk_intake_translations(locale,key,value) VALUES('es-US',?,?) ON CONFLICT(locale,key) DO UPDATE SET value=excluded.value", key, value)],
    { actor: actor.id, action: 'language.catalog', subject: 'site', detail: { key, reset: input.flag('reset'), site: 'primary' } })
  return { key }
}

export async function displayLocale(env: Bindings, actor: Actor | null, request: Request): Promise<Locale> {
  if (actor && actor.role !== 'agent' && !actor.service) return (await languagePreferences(env, actor)).effective
  const url = new URL(request.url), explicit = url.searchParams.get('language')
  if (isLocale(explicit)) return explicit
  const cookie = request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith('gasket-language='))?.slice('gasket-language='.length)
  if (isLocale(cookie)) return cookie
  const browser = (request.headers.get('accept-language') || '').split(',').map((part, index) => {
    const [tag, ...parameters] = part.trim().split(';')
    const quality = parameters.find(p => p.trim().startsWith('q='))?.trim().slice(2)
    return { tag: tag.toLowerCase(), quality: quality === undefined ? 1 : Number(quality), index }
  }).filter(p => p.quality > 0 && p.quality <= 1).sort((a,b) => b.quality-a.quality || a.index-b.index)
  for (const {tag} of browser) {
    if (tag === 'es' || tag.startsWith('es-')) return 'es-US'
    if (tag === 'en' || tag.startsWith('en-')) return 'en-US'
  }
  return (await one(env, 'SELECT locale FROM gk_language_settings WHERE singleton=1')).locale
}

export async function intakeLanguage(env: Bindings, locale: Locale) {
  const overrides = Object.fromEntries((await all(env, "SELECT key,value FROM gk_intake_translations WHERE locale='es-US'")).map(row => [row.key, row.value]))
  const spanish = { ...ES, ...overrides } as Record<IntakeKey, string>
  const missing = locale === 'es-US' ? (Object.keys(EN) as IntakeKey[]).filter(key => !spanish[key]) : []
  const messages = Object.fromEntries((Object.keys(EN) as IntakeKey[]).map(key => [key, locale === 'en-US' ? EN[key] : spanish[key] || EN[key] + ' [' + (spanish.untranslated || EN.untranslated) + ']'])) as Record<IntakeKey, string>
  const text = (key: IntakeKey, values: Record<string, unknown> = {}) => messages[key].replace(/\{(\w+)\}/g, (whole, key) => Object.hasOwn(values,key) ? String(values[key]) : whole)
  return { locale, messages, missing, text }
}
export type IntakeLanguage = Awaited<ReturnType<typeof intakeLanguage>>
export function intakeError(language: IntakeLanguage, code: string) {
  const key: IntakeKey = code.startsWith('missing_') ? 'error_fields'
    : code === 'intake_rate_limited' || code === 'intake_refused' ? 'error_rate'
    : code === 'portal_changed' ? 'error_changed'
    : code === 'label_retired' ? 'error_retired'
    : code === 'portal_closed' ? 'error_closed'
    : code === 'submission_key_reused' ? 'error_reused'
    : code === 'file_size' || code === 'request_too_large' ? 'error_size'
    : code === 'too_many_photos' ? 'error_photos'
    : code === 'label_unknown' || code === 'portal_not_found' ? 'error_label'
    : code === 'receipt_not_found' ? 'error_receipt'
    : code === 'request_erased' ? 'error_erased'
    : ['authentication_required','access_ended','forbidden','not_a_member'].includes(code) ? 'error_access'
    : /photo|image|file_type/.test(code) ? 'error_photo'
    : /invalid_|too_long_/.test(code) ? 'invalid' : 'error_generic'
  return language.text(key)
}
export async function intakeCompleteness(env: Bindings, actor: Actor) {
  owner(actor)
  const languages = await Promise.all(LOCALES.map(async locale => {
    const language = await intakeLanguage(env, locale)
    return { locale, total: Object.keys(EN).length, translated: Object.keys(EN).length-language.missing.length, missing: language.missing, keys: Object.keys(EN) }
  }))
  return { scope: 'Primary-site portal and scoped QR intake interface only; authored text is unchanged.', doors: ['portal', 'scoped QR intake'], languages }
}
export function languageCookie(response: Response, request: Request, actor: Actor | null) {
  const value = new URL(request.url).searchParams.get('language')
  if (!actor && isLocale(value)) response.headers.append('set-cookie', 'gasket-language=' + value + '; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly' + (new URL(request.url).protocol === 'https:' ? '; Secure' : ''))
  return response
}

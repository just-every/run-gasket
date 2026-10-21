// The exact byte protocol is shared with the documented receiver helper.
const utf8 = new TextEncoder()
export async function signWebhook(secret: string, timestamp: string, id: string, body: string) {
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, utf8.encode(`${timestamp}.${id}.${body}`))
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Domain separation from sessions and OIDC, random IV, subscription-bound AAD.
async function encryptionKey(secret: string) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8.encode(`gasket-webhooks-v1\0${secret}`)), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const decode = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0))
export async function sealSecret(root: string, id: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(id) }, await encryptionKey(root), utf8.encode(secret))
  return `${encode(iv)}.${encode(new Uint8Array(cipher))}`
}
export async function openSecret(root: string, id: string, sealed: string) {
  const [iv, cipher] = sealed.split('.')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: utf8.encode(id) }, await encryptionKey(root), decode(cipher)))
}
export const generateSecret = () => encode(crypto.getRandomValues(new Uint8Array(32)))

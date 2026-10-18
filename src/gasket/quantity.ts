// Exact part quantities: decimal text with at most three places, stored as
// integer thousandths. Meter values stay as the exact decimal text entered.
import { insist } from './core'

export function toMilli(text: string, name = 'quantity', { allowZero = false, allowNegative = false } = {}): number {
  const value = text.trim()
  insist(/^-?\d{1,9}(\.\d{1,3})?$/.test(value), `invalid_${name}`)
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = value.replace('-', '').split('.')
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
  insist(allowNegative || !negative, `invalid_${name}`)
  insist(allowZero || milli !== 0, `invalid_${name}`)
  return negative ? -milli : milli
}

export function fromMilli(milli: number): string {
  const sign = milli < 0 ? '-' : ''
  const absolute = Math.abs(milli)
  const fraction = String(absolute % 1000).padStart(3, '0').replace(/0+$/, '')
  return `${sign}${Math.floor(absolute / 1000)}${fraction ? `.${fraction}` : ''}`
}

/** A meter value: a decimal number, normalised (no leading zeros, no trailing fractional zeros). */
export function meterNumber(text: string, name = 'value'): string {
  const value = text.trim().replace(/,/g, '')
  insist(/^-?\d{1,12}(\.\d{1,6})?$/.test(value), `invalid_${name}`)
  const negative = value.startsWith('-')
  let [whole, fraction = ''] = value.replace('-', '').split('.')
  whole = whole.replace(/^0+(?=\d)/, '')
  fraction = fraction.replace(/0+$/, '')
  const out = fraction ? `${whole}.${fraction}` : whole
  return negative && out !== '0' ? `-${out}` : out
}

/** Exact comparison of two normalised meter values: -1, 0 or 1. */
export function compareMeter(a: string, b: string): number {
  const scale = (value: string) => { const negative = value.startsWith('-'); const [w, f = ''] = value.replace('-', '').split('.'); const n = BigInt(w + f.padEnd(6, '0')); return negative ? -n : n }
  const x = scale(a), y = scale(b)
  return x < y ? -1 : x > y ? 1 : 0
}

export function addMeter(a: string, b: string): string {
  const scale = (value: string) => { const negative = value.startsWith('-'); const [w, f = ''] = value.replace('-', '').split('.'); const n = BigInt(w + f.padEnd(6, '0')); return negative ? -n : n }
  const sum = scale(a) + scale(b)
  const negative = sum < 0n, text = (negative ? -sum : sum).toString().padStart(7, '0')
  return meterNumber(`${negative ? '-' : ''}${text.slice(0, -6)}.${text.slice(-6)}`)
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
/** A quantity or meter value as people read it: thousands grouped ("12,408"), decimals kept exactly. */
export const showNumber = (value: unknown) => value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? String(value ?? '') : NUMBER.format(Number(value))

// Site-local dates (YYYY-MM-DD) and date-times (YYYY-MM-DDTHH:MM). Gasket keeps
// what a person on site observed in the site's own clock; it never converts it.
export const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export const isLocalTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && isDate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60

export const isTimeZone = (zone: string) => {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true } catch { return false }
}

export function today(zone: string, at = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

export function localNow(zone: string, at = Date.now()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Minutes between two site-local date-times, read on one wall clock. */
export function minutesBetween(start: string, end: string): number {
  const at = (value: string) => Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10), +value.slice(11, 13), +value.slice(14, 16))
  return Math.round((at(end) - at(start)) / 60_000)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** US reading order: "Oct 15, 2026". */
export const showDate = (date: string | null | undefined) => date && isDate(date) ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}` : '—'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** With its weekday: "Wed Oct 21, 2026"; the year is left off with `short`: "Wed Oct 21". */
export const showDay = (date: string | null | undefined, { short = false } = {}) => {
  if (!date || !isDate(date)) return '—'
  const label = `${DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${showDate(date)}`
  return short ? label.replace(/, \d{4}$/, '') : label
}
/** Whole days from one date to a later one. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
/** A 24-hour "14:05" as US 12-hour "2:05 pm"; the stored value stays 24-hour. */
export const showClock = (time: string) => { const hour = Number(time.slice(0, 2)); return `${hour % 12 || 12}:${time.slice(3, 5)} ${hour < 12 ? 'am' : 'pm'}` }
export const showLocal = (value: string | null | undefined) => value && isLocalTime(value) ? `${showDate(value.slice(0, 10))}, ${showClock(value.slice(11))}` : '—'
export const showInstant = (instant: number | null | undefined, zone: string) => instant ? showLocal(localNow(zone, instant)) : '—'
/** The site's wall-clock time of an instant: "11:48 am". */
export const showTime = (instant: number, zone: string) => showClock(localNow(zone, instant).slice(11))

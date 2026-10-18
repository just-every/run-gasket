// Line icons drawn in currentColor (the rail's destinations, statuses and
// activity), and the copper machine drawings beside each asset, chosen by its
// category or name. Decorative: every icon sits beside its label.
import type { Html } from './html'

const raw = (html: string): Html => ({ html })
const line = (body: string, box = '0 0 24 24') => raw(`<svg class="gk-icon" viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`)

export const ICON = {
  work: line('<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2.5v3m8-3v3M4 9h16M8 13h3m-3 4h8"/>'),
  assets: line('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M7 7.5h1.5m5 0H17M7 16.5h1.5m5 0H17"/>'),
  schedules: line('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2.5v5m10-5v5M3 10h18M8 14.5l2.2 2.2L16 13"/>'),
  parts: line('<path d="m3 7 9-4.5L21 7v10l-9 4.5L3 17Z"/><path d="m3 7 9 4.5L21 7M12 11.5V21.5"/>'),
  proposals: line('<path d="m10 3 1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9Z"/><path d="M18.5 3v4m-2-2h4M18 15v5m-2.5-2.5h5"/>'),
  board: line('<path d="M5 20V11m7 9V4m7 16V8"/>'),
  movein: line('<path d="M12 3v11m-4.5-4.5L12 14l4.5-4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
  people: line('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.9 2.7 2.6 3 5.2"/>'),
  site: line('<path d="M12 21.5s-7.5-7.3-7.5-12.5a7.5 7.5 0 0 1 15 0c0 5.2-7.5 12.5-7.5 12.5Z"/><circle cx="12" cy="9" r="2.6"/>'),
  audit: line('<path d="M6 2.5h8.5L19 7v14.5H6Z"/><path d="M14 2.5V7.5h5M9 12h7m-7 4h7"/>'),
  more: line('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  menu: line('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: line('<path d="m6 6 12 12M6 18 18 6"/>'),
  pin: raw('<svg class="gk-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 22S4 13 4 8.2a8 8 0 0 1 16 0C20 13 12 22 12 22Z" fill="currentColor" stroke="none"/><circle cx="12" cy="8.4" r="2.6" fill="#fff" stroke="none"/></svg>'),
  clock: line('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2.5"/>'),
  progress: line('<circle cx="12" cy="12" r="8.5" opacity=".35"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17"/>'),
  done: raw('<svg class="gk-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m7.5 12.2 3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  check: line('<rect x="3" y="3" width="18" height="18" rx="6"/><path d="m7.5 12 3 3 6-6.5"/>'),
  wrench: line('<path d="M14.5 3a6 6 0 0 0-6 7.8L2.8 16.5a2.6 2.6 0 0 0 3.7 3.7l5.7-5.7A6 6 0 0 0 20.4 9l-3.9 3.1-3.6-3.6L16 4.6A6 6 0 0 0 14.5 3Z"/>'),
  calendar: line('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2.5v5m10-5v5M3 10h18"/>'),
  person: line('<circle cx="12" cy="7.5" r="4"/><path d="M4 21c.9-4 3.9-6 8-6s7.1 2 8 6"/>'),
  back: line('<path d="M19.5 12h-15m5.5-6-6 6 6 6"/>'),
  arrow: line('<path d="m9 5 7 7-7 7"/>'),
  open: line('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
}

/** What a recorded action looks like in the activity list. */
export const actionIcon = (action: string): Html => action.startsWith('proposal.') ? ICON.proposals
  : /submit|approve|return|close/.test(action) ? ICON.check
  : action.startsWith('part.') ? ICON.parts
  : /results|readings|finding|downtime|evidence/.test(action) ? ICON.wrench
  : action.startsWith('access.') || action.startsWith('site.') ? ICON.people
  : ICON.audit

const MACHINES: Record<string, string> = {
  press: '<rect x="7" y="2" width="26" height="5" rx="1"/><path d="M8 7v30h5V7m14 0v30h5V7M13 30h14M7 37h26M8 37v5h5v-5m14 0v5h5v-5M3 12h5v20H3Zm29 0h5v20h-5Z"/><path d="M13 19h14v5H13Z"/>',
  forklift: '<path d="M5 35V9h4v24m3-2 4.5-24h9.5v12h6.5l4.5 7v11H12M25 7l-2 13h-9M3 39h9"/><circle cx="16" cy="36" r="4"/><circle cx="31" cy="36" r="4"/>',
  oven: '<rect x="2" y="4" width="36" height="34" rx="2"/><path d="M9 31h22M14 13c-6 5 5 6-1 12m8-12c-6 5 5 6-1 12m8-12c-6 5 5 6-1 12M2 42h36"/>',
  tank: '<rect x="2" y="14" width="36" height="18" rx="7"/><path d="M10 14V8h8v6m7 0V5h7v9M21 5h14M8 32v6h5v-6m14 0v6h5v-6"/>',
  compressor: '<rect x="3" y="14" width="22" height="20" rx="3"/><circle cx="31.5" cy="24" r="6"/><path d="M25 24h.5M8 9h12v5M8 20h12m-12 6h12M7 34v5m14-5v5M2 39h36"/>',
  dryer: '<rect x="8" y="3" width="24" height="34" rx="3"/><path d="M14 10h12M14 16h12M20 22v8m-3-3 3 3 3-3M8 41h24"/>',
  pump: '<circle cx="17" cy="23" r="10"/><circle cx="17" cy="23" r="3"/><path d="M27 23h10M17 13V5h10M5 37h26M10 31l-3 6m17-6 3 6"/>',
  bin: '<path d="M4 14h32v24H4Z"/><path d="M4 14l4-8h24l4 8M14 22h12v5H14ZM2 42h36"/>',
  equipment: '<rect x="4" y="8" width="32" height="26" rx="3"/><path d="M4 18h32M12 13h3m10 0h3M10 34v5m20-5v5M2 39h36"/><circle cx="20" cy="26" r="4"/>',
}
const KINDS: [RegExp, string][] = [[/\bpress\b|stamp|punch/i, 'press'], [/fork|lift truck|reach truck/i, 'forklift'], [/oven|furnace|cure|kiln|fryer|cook/i, 'oven'],
  [/receiver|tank|vessel/i, 'tank'], [/dryer|drier/i, 'dryer'], [/compress|pneumatic|chill|refrig|cool/i, 'compressor'], [/pump|water|plumb/i, 'pump']]

const drawing = (kind: string, size: 'row' | 'band') => raw(`<svg class="gk-machine gk-machine-${size}" viewBox="0 0 40 44" aria-hidden="true" focusable="false">${MACHINES[kind]}</svg>`)

/** The copper line drawing for an asset, by its category or name. */
export const machine = (asset: { name: string; category?: string | null }, size: 'row' | 'band' = 'row'): Html =>
  drawing(KINDS.find(([pattern]) => pattern.test(`${asset.category ?? ''} ${asset.name}`))?.[1] ?? 'equipment', size)

/** A part's storeroom bin. */
export const binDrawing = drawing('bin', 'band')

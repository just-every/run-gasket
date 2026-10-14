// Fine-line icons in one 1.5px ink stroke set, for the cards and the "Also included" tiles.
const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const Calendar = () => (
  <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" {...line}><rect x="3" y="4.5" width="14" height="12.5" rx="1.5" /><path d="M3 8.5h14M7 2.5v4M13 2.5v4" /></svg>
)
export const Check = () => (
  <svg className="icon icon-check" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="m6 10.2 2.6 2.6L14 7.4" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** The six "Also included" icons, drawn at 48px. */
export const INCLUDED = {
  schedules: <svg viewBox="0 0 48 48" aria-hidden="true" {...line}><rect x="7" y="10" width="34" height="31" rx="3" /><path d="M7 18h34M15 6v8M24 6v8M33 6v8" /><path d="M13 24h5v4h-5zM21.5 24h5v4h-5zM30 24h5v4h-5zM13 32h5v4h-5zM21.5 32h5v4h-5zM30 32h5v4h-5z" /></svg>,
  revisions: <svg viewBox="0 0 48 48" aria-hidden="true" {...line}><path d="M12 5h17l9 9v29H12z" /><path d="M29 5v9h9" /><path d="M17 21h5v5h-5zM17 31h5v5h-5z" /><path d="m18 23.2 1.3 1.3 2.5-2.6M26 23.5h7M26 33.5h7" /></svg>,
  downtime: <svg viewBox="0 0 48 48" aria-hidden="true" {...line}><circle cx="24" cy="24" r="18" /><path d="M24 12v12l8 6" /><path d="M24 7v2M24 39v2M7 24h2M39 24h2" /></svg>,
  photos: <svg viewBox="0 0 48 48" aria-hidden="true" {...line}><path d="m6 14 26-5 1 5" /><rect x="10" y="14" width="32" height="25" rx="2" /><circle cx="31" cy="21" r="3" /><path d="m13 36 9-10 6 6 4-4 7 8" /></svg>,
  roles: <svg viewBox="0 0 48 48" aria-hidden="true" {...line}><circle cx="24" cy="15" r="6" /><path d="M14 38c0-6 4.5-10 10-10s10 4 10 10z" /><circle cx="11" cy="20" r="4.5" /><path d="M4 37c0-4.5 3-7.5 7-7.5 1.5 0 2.8.4 3.9 1.1" /><circle cx="37" cy="20" r="4.5" /><path d="M44 37c0-4.5-3-7.5-7-7.5-1.5 0-2.8.4-3.9 1.1" /></svg>,
  agents: <svg viewBox="0 0 48 48" aria-hidden="true" {...line}><path d="M9 5h24v34H9z" /><path d="M14 13h14M14 19h14M14 25h8" /><circle cx="33" cy="29" r="5" /><path d="M24 44c0-5 4-8 9-8s9 3 9 8z" /></svg>,
}

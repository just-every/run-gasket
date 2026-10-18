// Line icons for the homepage's cards, drawn on a 24-unit grid in the current colour.
import type { ReactNode } from 'react'

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  )
}

/** A filled disc with a white tick: done (green) or confirmed (blue). */
export function CheckDisc({ tone = 'green' }: { tone?: 'green' | 'blue' }) {
  return (
    <svg className={`disc disc-${tone}`} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" /><path d="m7 12.4 3.2 3.1L17.2 8.6" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
}
export function AlertDisc() {
  return (
    <svg className="disc disc-red" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" /><path d="M12 6.5v7" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" /><circle cx="12" cy="17.4" r="1.5" fill="#fff" /></svg>
  )
}
export const Thermometer = () => <Icon><path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" /><path d="M12 9v7" /><circle cx="12" cy="17" r="1.4" fill="currentColor" /></Icon>
export const QrCode = () => <Icon><rect x="3.5" y="3.5" width="6" height="6" rx="1" /><rect x="14.5" y="3.5" width="6" height="6" rx="1" /><rect x="3.5" y="14.5" width="6" height="6" rx="1" /><path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h2.5M20.5 18v2.5h-1.5" /></Icon>
export const Forklift = () => <Icon><path d="M3.5 17V9.5h5l2.5 4v3.5" /><path d="M8.5 9.5V5.5H5" /><path d="M14 4v13.5h7" /><circle cx="6" cy="18" r="2" /><circle cx="11" cy="18" r="1.6" /></Icon>
export const Package = () => <Icon><path d="M12 3 20 7.2v9.6L12 21l-8-4.2V7.2z" /><path d="m4 7.2 8 4.2 8-4.2M12 11.4V21M8 5.1l8 4.2" /></Icon>
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M7.5 13.5h3v3h-3z" /></Icon>
export const Bearing = () => <Icon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="5.6" r="1.2" /><circle cx="12" cy="18.4" r="1.2" /><circle cx="5.6" cy="12" r="1.2" /><circle cx="18.4" cy="12" r="1.2" /><circle cx="7.5" cy="7.5" r="1.2" /><circle cx="16.5" cy="16.5" r="1.2" /><circle cx="16.5" cy="7.5" r="1.2" /><circle cx="7.5" cy="16.5" r="1.2" /></Icon>
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>
export const Clipboard = () => <Icon><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3.5h6v1M9 4.5h6v2H9z" /><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" /></Icon>
export const Hose = () => <Icon><path d="M3.5 8.5h5a3.5 3.5 0 0 1 3.5 3.5v0a3.5 3.5 0 0 0 3.5 3.5h5" /><rect x="7" y="6" width="3" height="5" rx=".8" /><rect x="14" y="13" width="3" height="5" rx=".8" /><path d="M19 19.5c0 .8-.5 1.5-1 1.5s-1-.7-1-1.5.5-1.6 1-2.3c.5.7 1 1.5 1 2.3z" /></Icon>
export const Doc = () => <Icon><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15h6M9 18h4" /></Icon>
export const Drum = () => <Icon><ellipse cx="12" cy="5.5" rx="6.5" ry="2.2" /><path d="M5.5 5.5v13c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v-13M5.5 10c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2M5.5 14.5c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2" /></Icon>
export const Moon = () => <Icon><path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" fill="currentColor" stroke="none" /></Icon>
export const Refresh = () => <Icon><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2" /></Icon>
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" /><path d="M15 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.8c1.7.6 2.8 2.2 3 4.7" /></Icon>
export const Cloud = () => <Icon><path d="M7 18.5h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18.5z" /></Icon>
export const Cube = () => <Icon><path d="M12 3.5 19.5 7.5v9L12 20.5l-7.5-4v-9z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5v9" /></Icon>
export const Cross = () => <Icon className="icon-cross"><path d="M6 6l12 12M18 6 6 18" strokeWidth={2.6} /></Icon>
export const Report = () => <Icon><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><path d="M8 8h8M8 11.5h8M8 15h5" /></Icon>
export const ArrowRight = () => <Icon className="icon-arrow"><path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" strokeWidth={2.2} /></Icon>
export const ArrowDown = () => <Icon className="icon-arrow"><path d="M12 4.5v15M6.5 14l5.5 5.5 5.5-5.5" strokeWidth={2.2} /></Icon>

/** The phone's status bar glyphs. */
export const SignalOff = () => <svg className="status-glyph" viewBox="0 0 22 14" aria-label="No signal" role="img"><path d="M2 12h2M7 12h2M12 12h2M17 12h2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity=".45" /><path d="M3 2l15 11" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /></svg>
export const Bars = () => <svg className="status-glyph" viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx=".8" fill="currentColor" /><rect x="5" y="5.5" width="3" height="6.5" rx=".8" fill="currentColor" /><rect x="10" y="3" width="3" height="9" rx=".8" fill="currentColor" /><rect x="15" y="0" width="3" height="12" rx=".8" fill="currentColor" /></svg>
export const Wifi = () => <svg className="status-glyph" viewBox="0 0 18 13" aria-hidden="true"><path d="M1.5 4.8a11 11 0 0 1 15 0M4.2 7.6a7 7 0 0 1 9.6 0M6.9 10.3a3 3 0 0 1 4.2 0" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" /></svg>
export const Battery = () => <svg className="status-glyph" viewBox="0 0 26 13" aria-hidden="true"><rect x=".8" y=".8" width="21.4" height="11.4" rx="3" fill="none" stroke="currentColor" strokeWidth={1.2} opacity=".5" /><rect x="2.6" y="2.6" width="15.5" height="7.8" rx="1.6" fill="currentColor" /><path d="M24 4.6v3.8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity=".5" /></svg>

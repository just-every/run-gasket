// AGENT-003: source evidence stays beside the human decision.
import type { Actor } from '../actor'
import { usd } from '../bad-actors'
import { h, table } from './html'

export function intervalEvidenceCard(row: any, _actor: Actor) {
  const b = row.basis
  return h`<section aria-label="Interval evidence"><h3>Evidence and trade-off</h3><p>${b.from} to ${b.to} · ${b.schedule.title}</p>
    <p>${b.expectedEffect}</p><p>Nominal calendar frequency change: ${b.calendarFrequencyChangePercent === null ? 'unchanged' : `${b.calendarFrequencyChangePercent}%`}; counter frequency change: ${b.meterFrequencyChangePercent === null ? 'unchanged' : `${b.meterFrequencyChangePercent}%`}. These are arithmetic changes, not predicted savings.</p><p class="gk-muted">Observational comparison; no causal reliability improvement or standards verification is claimed.</p>
    ${table(['Asset', 'Failures / 1,000 h', 'Run hours', 'Downtime', 'PMs', 'Actual cost'], b.assets.map((a: any) => [
      h`<a href="/app/assets/${a.id}">${a.tag} ${a.name}</a>`, `${a.failures} / ${a.failuresPer1000Hours === null ? 'unknown' : a.failuresPer1000Hours}`, a.operatingHours === null ? 'Unknown' : a.operatingHours,
      `${a.downtimeMinutes} min`, `${a.completedPMs} completed; ${a.latePMs} late`, usd(a.actualCostCents),
    ]), 'Source asset comparison', { wrap: [0,4] })}
    <h3>Uncertainty and coverage</h3><ul>${b.uncertainty.map((text: string) => h`<li>${text}</li>`)}</ul>
    <h3>Declared hard limits</h3><p>OEM, legal and site references are entered by the lead and have not been independently verified by Gasket. Bounds are inclusive.</p>
    <ul>${b.limits.map((l: any) => h`<li>${l.source.toUpperCase()} r${l.revision}: ${l.min_days === null ? '' : `${l.min_days}–${l.max_days} days`}${l.min_units === null ? '' : ` ${l.min_units}–${l.max_units} meter units`} · ${l.reference}</li>`)}</ul>
    <h3>Rollback plan</h3>${row.payload.outcome ? h`<p><a href="/api/gasket/outcomes/${row.payload.outcome}">Read the retained outcome comparison</a></p>` : ''}<p>${row.payload.rollbackPlan}</p>${row.payload.rollbackOf ? h`<p>Restores the prior approved interval. Current limits and source versions still apply.</p>` : ''}
    <details class="gk-details"><summary>Source records</summary>${b.assets.map((a: any) => h`<h4>${a.tag}</h4><ul>${(a.work ?? []).map((w: any) => h`<li><a href="/app/work/${w.id}">WO-${w.number}: ${w.title}</a></li>`)}</ul>`)}</details></section>`
}

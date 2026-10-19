// FIELD-004: typed checklist steps. Each step of a revision is a check (pass,
// needs attention or fail), a number with its unit and inclusive limits, text,
// a choice from options, or a photo. A step may apply only when an earlier step
// has a given answer, and a number step may name the asset meter its value is
// kept as. Steps keep their identity (key) from revision to revision.
import { insist, newId } from './core'
import { compareMeter, meterNumber } from './quantity'

export type StepKind = 'check' | 'number' | 'text' | 'option' | 'photo'
export interface ChecklistItem { text: string; key?: string; kind?: StepKind; unit?: string; min?: string; max?: string; options?: string[]; failOn?: string[]; when?: { step: string; is: string }; meter?: string }
export type Answer = { outcome: string; value: string | null }

export const kindOf = (step: ChecklistItem): StepKind => step.kind ?? 'check'
const OUTCOMES = ['pass', 'fail', 'attention']
const bad = (step: number, part: string) => insist(false, 'invalid_step', 400, { step, part })

/**
 * One line per step: the label, then `|`-separated parts: `check` (the default), `number <unit> <min>..<max>`
 * (either limit may be left out), `text`, `options a, b, c` with `fail on b`, `photo`, `when step N is <answer>`
 * (N an earlier step), `meter <name>` and `key <key>`. A step keeps the key of the step it replaces: the one it
 * names with `key`, or else the previous revision's step with the same label (ignoring case).
 */
export function parseSteps(lines: string[], previous: ChecklistItem[]): ChecklistItem[] {
  insist(lines.length >= 1 && lines.length <= 60, 'invalid_items')
  const steps: ChecklistItem[] = [], taken = new Set<string>()
  const earlierKeys = new Set(previous.map(step => step.key).filter(Boolean))
  for (const [index, line] of lines.entries()) {
    const [label, ...parts] = line.split('|').map(part => part.trim())
    insist(label && label.length <= 300, 'invalid_items')
    const step: ChecklistItem = { text: label }
    let kinds = 0, named: string | undefined, when: [number, string] | undefined
    for (const part of parts) {
      let match: RegExpMatchArray | null
      if (/^(check|pass\/fail)$/i.test(part)) { step.kind = 'check'; kinds++ }
      else if ((match = part.match(/^number\s+(.+)$/i))) {
        const tokens = match[1].split(/\s+/), limits = /^(-?[\d.,]+)?\.\.(-?[\d.,]+)?$/.test(tokens.at(-1)!) ? tokens.pop()!.split('..') : null
        step.kind = 'number'; step.unit = tokens.join(' '); kinds++
        if (!step.unit || step.unit.length > 20) bad(index + 1, part)
        if (limits) {
          if (limits[0]) step.min = meterNumber(limits[0], 'step')
          if (limits[1]) step.max = meterNumber(limits[1], 'step')
          if (!step.min && !step.max) bad(index + 1, part)
          if (step.min && step.max && compareMeter(step.min, step.max) > 0) bad(index + 1, part)
        }
      }
      else if (/^text$/i.test(part)) { step.kind = 'text'; kinds++ }
      else if ((match = part.match(/^options?\s+(.+)$/i))) {
        step.kind = 'option'; kinds++
        step.options = match[1].split(',').map(option => option.trim()).filter(Boolean)
        const distinct = new Set(step.options.map(option => option.toLowerCase()))
        if (step.options.length < 2 || step.options.length > 20 || distinct.size !== step.options.length || step.options.some(option => option.length > 60)) bad(index + 1, part)
      }
      else if ((match = part.match(/^fail on\s+(.+)$/i))) step.failOn = match[1].split(',').map(option => option.trim()).filter(Boolean)
      else if (/^photo$/i.test(part)) { step.kind = 'photo'; kinds++ }
      else if ((match = part.match(/^when step\s+(\d+)\s+is\s+(.+)$/i))) when = [Number(match[1]) - 1, match[2].trim()]
      else if ((match = part.match(/^meter\s+(.+)$/i)) && match[1].length <= 120) step.meter = match[1]
      else if ((match = part.match(/^key\s+(\S+)$/i))) named = match[1]
      else bad(index + 1, part)
    }
    if (kinds > 1) bad(index + 1, 'one kind per step')
    if (step.failOn) {
      if (step.kind !== 'option') bad(index + 1, 'fail on needs options')
      step.failOn = step.failOn.map(choice => step.options!.find(option => option.toLowerCase() === choice.toLowerCase()) ?? bad(index + 1, `fail on ${choice}`) as never)
    }
    if (step.meter && step.kind !== 'number') bad(index + 1, 'meter needs a number step')
    if (when) {
      const [at, is] = when, earlier = steps[at]
      if (!earlier || at >= index) bad(index + 1, `when step ${at + 1}`)
      step.when = { step: earlier.key!, is: answerName(earlier, is) ?? bad(index + 1, `is ${is}`) as never }
    }
    if (named) insist(earlierKeys.has(named), 'invalid_step', 400, { step: index + 1, part: `key ${named}` })
    const kept = named ?? previous.find(old => old.key && !taken.has(old.key) && old.text.toLowerCase() === label.toLowerCase())?.key
    step.key = kept ?? `s-${newId().slice(0, 8)}`
    insist(!taken.has(step.key), 'invalid_step', 400, { step: index + 1, part: `key ${step.key}` })
    taken.add(step.key)
    steps.push(step)
  }
  return steps
}

/** The answer a condition names, in its stored form: an outcome for a check or number, an option's own spelling. */
function answerName(step: ChecklistItem, is: string): string | undefined {
  const said = is.toLowerCase().replace(/^needs attention$/, 'attention').replace(/^(fails|failed)$/, 'fail').replace(/^(passes|passed)$/, 'pass')
  if (kindOf(step) === 'option') return step.options!.find(option => option.toLowerCase() === said)
  if (kindOf(step) === 'check') return OUTCOMES.includes(said) ? said : undefined
  if (kindOf(step) === 'number') return ['pass', 'fail'].includes(said) ? said : undefined
  return undefined
}

/** The line that writes a step back, for the next revision's form. */
export function lineOf(step: ChecklistItem, steps: ChecklistItem[]): string {
  const parts = [step.text]
  if (step.kind === 'number') parts.push(`number ${step.unit}${step.min || step.max ? ` ${step.min ?? ''}..${step.max ?? ''}` : ''}`)
  if (step.kind === 'text' || step.kind === 'photo') parts.push(step.kind)
  if (step.kind === 'option') parts.push(`options ${step.options!.join(', ')}`, ...(step.failOn?.length ? [`fail on ${step.failOn.join(', ')}`] : []))
  if (step.when) parts.push(`when step ${steps.findIndex(other => other.key === step.when!.step) + 1} is ${step.when.is}`)
  if (step.meter) parts.push(`meter ${step.meter}`)
  return parts.join(' | ')
}

/**
 * Whether a step applies, given the answers so far: an unconditional step always does; a conditional one once the
 * step it names applies and has the answer it names (an option's value, otherwise the outcome).
 */
export function applies(steps: ChecklistItem[], index: number, answers: Map<number, Answer>): boolean {
  const when = steps[index].when
  if (!when) return true
  const at = steps.findIndex(step => step.key === when.step)
  const answer = answers.get(at)
  if (at < 0 || !answer || !applies(steps, at, answers)) return false
  return (kindOf(steps[at]) === 'option' ? answer.value : answer.outcome) === when.is
}

/** What an answer records: a check's own outcome; a number passes inside its limits (inclusive) and fails outside; text passes once given; an option fails when it is listed under fail on. */
export function answer(step: ChecklistItem, outcome: string, value: string): Answer {
  const kind = kindOf(step)
  insist(kind !== 'photo', 'photo_step_takes_evidence', 409)
  if (kind === 'check') {
    insist(OUTCOMES.includes(outcome) && !value, 'invalid_outcome')
    return { outcome, value: null }
  }
  insist(!outcome, 'outcome_from_value')
  if (kind === 'number') {
    const number = meterNumber(value)
    const outside = (step.min !== undefined && compareMeter(number, step.min) < 0) || (step.max !== undefined && compareMeter(number, step.max) > 0)
    return { outcome: outside ? 'fail' : 'pass', value: number }
  }
  if (kind === 'option') {
    const chosen = step.options!.find(option => option.toLowerCase() === value.toLowerCase())
    insist(chosen, 'invalid_value')
    return { outcome: step.failOn?.includes(chosen) ? 'fail' : 'pass', value: chosen }
  }
  insist(value.length <= 1000, 'invalid_value')
  return { outcome: 'pass', value }
}

/** How a step reads to a person: its kind, unit and limits, options and condition. */
export function stepSummary(step: ChecklistItem, steps: ChecklistItem[]): string {
  const kind = kindOf(step)
  const limits = step.min !== undefined && step.max !== undefined ? `, ${step.min} to ${step.max}` : step.min !== undefined ? `, at least ${step.min}` : step.max !== undefined ? `, at most ${step.max}` : ''
  const what = kind === 'number' ? `Number in ${step.unit}${limits}${step.meter ? `, kept as the ${step.meter} reading` : ''}` : kind === 'text' ? 'Text' : kind === 'photo' ? 'Photo required'
    : kind === 'option' ? `One of ${step.options!.join(', ')}${step.failOn?.length ? `; ${step.failOn.join(', ')} fails` : ''}` : 'Pass, needs attention or fail'
  const at = step.when ? steps.findIndex(other => other.key === step.when!.step) : -1
  const is = step.when ? (step.when.is === 'attention' ? 'needs attention' : step.when.is === 'fail' && kindOf(steps[at]) === 'number' ? 'outside its limits' : step.when.is === 'pass' && kindOf(steps[at]) === 'number' ? 'within its limits' : step.when.is) : ''
  return `${what}${step.when ? `; only when step ${at + 1} is ${is}` : ''}`
}

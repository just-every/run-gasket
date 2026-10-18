// The demo's clock. Its story is one morning on the Dayton floor, 6:00 to 11:48 am on launch day, after days
// stamped at their own wall-clock times. Launched after the morning, each moment keeps its time; launched before
// it, the morning is pressed into the hours before launch, in the same order, so nothing is stamped in the future.
import { addDays, today, zonedInstant } from './dates'
import type { Moment } from './demo-data'

const MORNING = ['06:00', '11:48'] as const

export function storyClock(zone: string, launch: number) {
  const day = today(zone, launch)
  const wall = (offset: number, time: string) => zonedInstant(zone, `${addDays(day, offset)}T${time}`)
  const [first, last] = MORNING.map(time => wall(0, time))
  const open = launch >= wall(0, '06:30') ? first : wall(0, '00:00')
  const end = Math.max(open + 1, launch - 60_000)
  const pressed = launch < last + 120_000
  /** The instant of a story moment; today's are kept before launch. */
  const at = ([offset, time]: Moment) => {
    const instant = wall(offset, time)
    if (offset !== 0 || !pressed) return instant
    return Math.round(open + (Math.max(instant, first) - first) * (end - open) / (last - first))
  }
  return { day, at, wall }
}
export type StoryClock = ReturnType<typeof storyClock>

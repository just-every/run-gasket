// The flows' clock. Each run starts at noon on the site's current day and runs
// forward from there, so no run reaches the site's midnight (a replay minutes back
// stays on today; a long run never changes day between two reads). The Worker
// under test runs on the same clock (emitted-worker.mjs `offset`); the product
// keeps reading Date.now() as it does in production.
import { today, zonedInstant } from '../../src/gasket/dates.ts'

export const zone = 'Australia/Sydney'
/** Milliseconds from the machine's clock to the run's clock. */
export const offset = zonedInstant(zone, `${today(zone)}T12:00`) - Date.now()
/** The run's now (ms). */
export const now = () => Date.now() + offset

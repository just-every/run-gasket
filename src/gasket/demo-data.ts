// Hollis Stamping & Coating's Dayton plant, the invented buyer of the homepage
// and the app pick: presses, compressors, a cure oven and a forklift. Dates are
// day offsets from launch ('sat' is the coming Saturday's planned shutdown).
export const demoSite = { name: 'Hollis Stamping & Coating, Dayton', timezone: 'America/New_York' }
export const demoOwner = 'Ellen Brandt'

export const demoAssets = [
  ['press1', 'PR-01', 'Press 1', 'MN-200-11872', 'Line A, bay 1', 'Stamping press', 'critical'],
  ['press2', 'PR-02', 'Press 2', 'MN-250-11904', 'Line A, bay 2', 'Stamping press', 'critical'],
  ['press3', 'PR-03', 'Press 3', 'AI-400-20417', 'Line A, bay 3', 'Stamping press', 'critical'],
  ['press4', 'PR-04', 'Press 4', 'AI-300-20533', 'Line B, bay 1', 'Stamping press', 'critical'],
  ['ac01', 'AC-01', 'AC-01 compressor', 'SL-75-61208', 'Compressor room', 'Air compressor', 'important'],
  ['ac02', 'AC-02', 'AC-02 compressor', 'SL-75-61344', 'Compressor room', 'Air compressor', 'critical'],
  ['rt01', 'RT-01', 'RT-01 receiver', 'RV-1060-0419', 'Compressor room', 'Air receiver', 'important'],
  ['dr01', 'DR-01', 'DR-01 dryer', 'DRY-400-7731', 'Compressor room', 'Air dryer', 'normal'],
  ['oven', 'CO-1', 'Cure oven', 'CO-48-3102', 'Powder-coat line', 'Cure oven', 'critical'],
  ['fl07', 'FL-07', 'FL-07 forklift', 'HY-50-88317', 'Loading dock', 'Forklift', 'important'],
] as const

export const demoPeople = [
  ['ray', 'Ray Kowalski', 'lead'], ['dana', 'Dana Ortiz', 'supervisor'],
  ['marcus', 'Marcus Bell', 'maintainer'], ['keisha', 'Keisha Johnson', 'maintainer'],
  ['devon', 'Devon Harris', 'maintainer'], ['brenda', 'Brenda Walsh', 'maintainer'],
  ['agent', 'Gasket agent', 'agent'],
] as const

export const demoParts = [
  ['bearing', '6316-C3', 'Motor bearing 6316-C3', 'each', 2, 0, 'Storeroom D-07'],
  ['oil', 'AW-46', 'Hydraulic oil AW-46, 55 gal drum', 'drum', 4, 3.75, 'Storeroom OIL-2'],
  ['grease', 'EP2-14', 'EP2 grease, 14 oz cartridge', 'each', 10, 24, 'Storeroom A-03'],
  ['filter', 'HF-10', 'Press hydraulic filter element', 'each', 2, 3, 'Storeroom B-11'],
  ['seal', 'DC-SK3', 'Die clamp fitting seal kit', 'kit', 2, 1, 'Storeroom B-12'],
  ['fl-kit', 'FL-250K', 'Forklift 250-hr service kit', 'kit', 1, 2, 'Storeroom C-02'],
] as const

export const demoChecks = [
  ['lube', 'Press weekly lube and air check', ['Lube gibs and slide ways', 'Clutch and brake air at 80 to 90 psi', 'Drain the air line filter bowl', 'Check the counterbalance for leaks']],
  ['dieset', 'Die-set check', ['Inspect guide posts and bushings', 'Torque the die clamps', 'Record the stroke counter']],
  ['forklift', 'Forklift 250-hr service', ['Change engine oil and filter', 'Inspect forks, chains and mast', 'Check hydraulic hoses', 'Record engine hours']],
  ['receiver', 'Receiver drain and check', ['Drain condensate', 'Test the relief valve', 'Inspect the shell and supports']],
  ['dryer', 'Dryer dew point check', ['Read the dew point', 'Clean the drain trap']],
  ['compressor', 'Compressor 2,000-hr service', ['Change the oil separator', 'Change air and oil filters', 'Check the coupling', 'Record run hours']],
  ['hydraulic', 'Press hydraulic filter change', ['Lock out the press', 'Replace the filter element', 'Top up AW-46 to the sight glass']],
  ['burner', 'Cure oven burner and airflow check', ['Inspect the burner flame', 'Test the airflow switch', 'Record the cure temperature']],
  ['round', 'Compressor room round', ['AC-01 discharge pressure', 'AC-02 bearing velocity', 'RT-01 drain', 'DR-01 dew point']],
] as const

/** Calendar schedules: key, asset, checklist, every days, next due (offset), default maintainer. */
export const demoSchedules = [
  ['lube', 'press1', 'lube', 7, -1, 'devon'],
  ['dieset', 'press4', 'dieset', 30, 0, 'keisha'],
  ['forklift', 'fl07', 'forklift', 30, 0, 'marcus'],
  ['receiver', 'rt01', 'receiver', 7, 0, 'keisha'],
  ['dryer', 'dr01', 'dryer', 7, 0, 'devon'],
  ['compressor', 'ac02', 'compressor', 90, 'sat', 'keisha'],
  ['hydraulic', 'press3', 'hydraulic', 90, 90, 'keisha'],
  ['round', 'ac01', 'round', 7, 7, 'keisha'],
] as const

/** Story moments: [day offset from launch, site-local "HH:MM"]. */
export type Moment = readonly [number, string]

/**
 * Work: key, number, asset, title, due, assignee, status, checklist (preventive) or null (corrective), when Ray
 * raised it, and when it was submitted (closed work was approved an hour later) or null. Numbers follow the raising order.
 */
export const demoWork: readonly (readonly [string, number, string, string, number | 'sat', string, string, string | null, Moment, Moment | null])[] = [
  ['hydraulic', 4410, 'press3', 'Hydraulics filter change', 0, 'keisha', 'submitted', 'hydraulic', [-21, '06:40'], [0, '11:48']],
  ['burner', 4450, 'oven', 'Burner and airflow check', -5, 'marcus', 'closed', null, [-9, '06:35'], [-5, '14:20']],
  ['clutch', 4457, 'press2', 'Clutch and brake inspection', -2, 'devon', 'closed', null, [-6, '06:35'], [-2, '13:05']],
  ['dieset', 4462, 'press4', 'Die-set check at 1,500,000 strokes', 0, 'keisha', 'open', 'dieset', [-4, '06:30'], null],
  ['round', 4463, 'ac01', 'Compressor room round', 0, 'keisha', 'submitted', 'round', [-4, '06:31'], [0, '07:58']],
  ['lube', 4466, 'press1', 'Weekly lube and air check', -1, 'devon', 'open', 'lube', [-4, '06:32'], null],
  ['forklift', 4468, 'fl07', '250-hr service (Samsara 4,012 hrs)', 0, 'marcus', 'open', 'forklift', [-3, '06:30'], null],
  ['receiver', 4469, 'rt01', 'Receiver drain and check', 0, 'keisha', 'open', 'receiver', [-3, '06:31'], null],
  ['dryer', 4470, 'dr01', 'Dryer dew point check', 0, 'devon', 'open', 'dryer', [-3, '06:32'], null],
  ['bearings', 4471, 'ac02', 'Replace motor bearings, 6316-C3 × 2', 'sat', 'marcus', 'open', null, [-2, '09:40'], null],
  ['compressor', 4472, 'ac02', '2,000-hr service', 'sat', 'keisha', 'open', 'compressor', [-2, '09:42'], null],
  ['coil', 4473, 'press4', 'Coil feed alignment', 0, 'marcus', 'open', 'dieset', [-1, '05:40'], null],
  ['diechange', 4474, 'press2', 'Die change support', 0, 'devon', 'in_progress', null, [-1, '05:50'], null],
  ['clamp', 4480, 'press3', 'Die clamp fitting leaking (QR fault R-2291)', 0, 'keisha', 'in_progress', null, [-1, '06:14'], null],
]

export const CORRECTIVE: Record<string, string> = {
  diechange: 'Support the die change on Press 2 from 11:00 am to 2:00 pm; check the clamps before the first hit.',
  clamp: 'Luis Ramirez scanned the Press 3 QR tag at 6:12 am: die clamp fitting leaking. Replace the fitting seal.',
  bearings: 'Planned shutdown, 6:00 to 11:30 am. Both 6316-C3 bearings came from Mesa on transfer T-0318. Lock out per LOTO-AC-02 rev 4.',
  clutch: 'Monthly clutch and brake inspection.',
  burner: 'Burner flame and airflow check on the powder-coat cure oven.',
}

/** Meters: key, asset, name, unit, kind, the reading a week ago, the latest reading (yesterday). */
export const demoMeters = [
  ['oven-temp', 'oven', 'Cure temperature', '°F', 'gauge', '391', '392'],
  ['fl07-hours', 'fl07', 'Engine hours', 'hrs', 'counter', '3962', '4012'],
  ['ac02-hours', 'ac02', 'Run hours', 'hrs', 'counter', '17842', '17905'],
  ['ac02-velocity', 'ac02', 'Bearing velocity', 'in/s', 'gauge', '0.29', '0.37'],
  ['press4-strokes', 'press4', 'Stroke counter', 'strokes', 'counter', '1482200', '1498640'],
  ['rt01-pressure', 'rt01', 'Tank pressure', 'psi', 'gauge', '124', '125'],
] as const

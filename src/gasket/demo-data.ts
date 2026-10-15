// Harbour Kitchen Co is the invented business used by Gasket's MaintainX fixtures.
export const demoAssets = [
  ['chiller', 'HK-101', 'Blast chiller', 'WBC-55102', 'Cold prep', 'Refrigeration', 'critical'],
  ['oven', 'HK-102', 'Combi oven', 'RCP-778120', 'Hot line', 'Cooking', 'important'],
  ['dishwasher', 'HK-103', 'Pass-through dishwasher', 'HB-30017', 'Dish bay', 'Warewashing', 'important'],
  ['ice', 'HK-105', 'Ice machine', 'IM-24019', 'Beverage station', 'Refrigeration', 'normal'],
  ['fan', 'HK-106', 'Exhaust fan', 'EF-4012', 'Roof', 'Ventilation', 'critical'],
  ['mixer', 'HK-107', 'Planetary mixer', 'MX-2107', 'Bakery', 'Preparation', 'normal'],
  ['cooler', 'HK-108', 'Walk-in cooler compressor', 'CMP-20419', 'Plant room A', 'Refrigeration', 'critical'],
  ['fryer', 'HK-109', 'Twin fryer', 'FRY-88', 'Hot line', 'Cooking', 'important'],
] as const

export const demoPeople = [
  ['lead', 'Lena Park', 'lead'], ['max', 'Max Ortiz', 'maintainer'],
  ['mo', 'Mo Haddad', 'maintainer'], ['sam', 'Sam Ito', 'supervisor'],
] as const

export const demoParts = [
  ['gasket', 'GSK-BC20', 'Door gasket, blast chiller', 'each', 1, 2, 'Store room shelf B'],
  ['rinse', 'RA-5L', 'Rinse aid, 5 L', 'bottle', 2, 1, 'Chemical store'],
  ['seal', 'OV-SEAL', 'Oven door seal', 'each', 1, 0, 'Store room shelf B'],
  ['probe', 'TP-9', 'Thermostat probe', 'each', 1, 3, 'Electrical cabinet'],
  ['filter', 'AF-400', 'Extract grease filter', 'each', 2, 4, 'Store room shelf C'],
  ['belt', 'MX-B12', 'Mixer drive belt', 'each', 1, 2, 'Store room shelf C'],
] as const

export const demoChecks = [
  ['cold', 'Cold room weekly inspection', ['Inspect the door seal for cracks', 'Clean condenser fins and drain', 'Record cabinet temperature']],
  ['oven', 'Combi oven monthly service', ['Inspect door seal and hinges', 'Check spray arm and descale cycle', 'Inspect power and gas connections']],
  ['wash', 'Dishwasher daily check', ['Clean tank strainer', 'Inspect rinse jets', 'Confirm rinse temperature']],
  ['fan', 'Extraction monthly inspection', ['Isolate and inspect drive belt', 'Clean grease filters', 'Check fan vibration after restart']],
] as const

// Day offsets keep overdue work, today's job and upcoming maintenance meaningful.
export const demoWork = [
  ['cold', 'chiller', 'Inspect blast chiller door seal', -2, 'owner', 'open', 'cold'],
  ['oven', 'oven', 'Monthly combi oven service', 0, 'max', 'in_progress', 'oven'],
  ['wash', 'dishwasher', 'Replace leaking rinse hose', 1, 'mo', 'open', null],
  ['fan', 'fan', 'Clean extraction filters and check belt', 3, 'max', 'open', 'fan'],
  ['ice', 'ice', 'Descale ice machine water circuit', 5, 'owner', 'open', null],
  ['cooler', 'cooler', 'Weekly cooler inspection', -1, 'mo', 'submitted', 'cold'],
  ['mixer', 'mixer', 'Replace mixer drive belt', -8, 'max', 'closed', null],
  ['fryer', 'fryer', 'Calibrate fryer thermostat', -5, 'mo', 'closed', null],
] as const

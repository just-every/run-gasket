// Versioned starting points for local adaptation; equipment-specific intervals,
// hazards and manufacturer instructions require independent human approval.
const starters = [
  ['air-compressor','Air compressor','Inspect intake filter and record condition','Check lubricator level against the equipment manual','Inspect guards, hoses and fittings for visible damage'],
  ['pump','Pump','Inspect seals and visible leakage','Record unusual noise and vibration','Inspect guards and coupling condition'],
  ['electric-motor','Electric motor','Inspect cooling paths','Record unusual noise and vibration','Inspect visible guard condition'],
  ['conveyor','Conveyor','Inspect belt and tracking condition','Inspect guarding and accessible rollers','Record visible wear'],
  ['hvac','HVAC unit','Inspect filter condition','Record operating condition','Inspect visible drain and coil condition'],
  ['boiler','Boiler','Record equipment condition for a qualified reviewer','Check required inspection records','Record visible leakage without opening equipment'],
  ['forklift','Forklift','Inspect visible tire and fork condition','Record required pre-use inspection status','Report visible leakage'],
  ['fire-extinguisher','Fire extinguisher','Check accessible placement and identification','Record visible gauge and seal condition','Check required inspection tag'],
  ['backup-generator','Backup generator','Inspect visible fuel and fluid leakage','Record inspection and test records','Inspect visible guards and enclosure condition'],
]
export const PM_LIBRARY = starters.map(([id,name,...items])=>({id,version:1,name,items:['Review the site isolation procedure and applicable equipment manual before work',...items,'Record defects and refer unsafe conditions to the maintenance lead'],everyDays:30,notice:'Starting template only. Adapt the interval and steps to the equipment manual and site safety requirements; independent approval is required before rollout.'}))

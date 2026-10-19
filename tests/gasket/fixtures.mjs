// MaintainX exports in their documented shapes (column names from MaintainX's
// help centre: asset export, part export and manual meter-reading export).
// The business, people and equipment are invented.
const csv = rows => rows.map(row => row.map(cell => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(',')).join('\r\n') + '\r\n'

const ASSET_COLUMNS = ['Name', 'ID', 'Status', 'Parent', 'All Parents', 'Location', 'Parent Location', 'All Parent Locations', 'Types', 'URL', 'Description', 'QR/Barcode', 'Teams Assigned to', 'Vendors', 'Vendor IDs', 'Created by', 'Created on', 'Last updated', 'Thumbnail', 'Criticality', 'Location Address', 'Attachments', 'Purchase Price', 'Purchase Date', 'Salvage Value', 'Current Book Value', 'Useful Life (Years)', 'Depreciation Start Date', 'Annual Depreciation', 'Accumulated Depreciation', 'Manufacturer', 'Model', 'Notes', 'Serial Number', 'Year']
const asset = values => ASSET_COLUMNS.map(column => values[column] ?? '')

export const assetsCsv = csv([ASSET_COLUMNS,
  asset({ Name: 'Blast chiller', ID: '81001', Status: 'Online', Location: 'Cold prep', Types: 'Refrigeration', 'QR/Barcode': 'HK-101', 'Teams Assigned to': 'Kitchen maintenance', Criticality: 'Critical', Manufacturer: 'Williams', Model: 'WMBC20', 'Serial Number': 'WBC-55102', Year: '2021', 'Created by': 'Dana Reyes', 'Created on': '01/12/2024' }),
  asset({ Name: 'Combi oven', ID: '81002', Status: 'Online', Location: 'Hot line', Types: 'Cooking', 'QR/Barcode': 'HK-102', 'Teams Assigned to': 'Kitchen maintenance, Electrical', Criticality: 'Important', Manufacturer: 'Rational', Model: 'iCombi Pro 10-1/1', 'Serial Number': 'RCP-778120', Description: 'Gas, 10 tray' }),
  asset({ Name: 'Pass-through dishwasher', ID: '81003', Status: 'Offline', Parent: 'Dish bay line', Location: 'Dish bay', Types: 'Warewashing', 'Teams Assigned to': 'Kitchen maintenance', Criticality: 'Normal', 'Serial Number': 'HB-30017' }),
  asset({ Name: 'Combi oven (old row)', ID: '81002', Status: 'Online', Location: 'Hot line', 'QR/Barcode': 'HK-199' }),
  asset({ Name: 'Ice machine', ID: '81005', Status: 'Online', Location: '', 'QR/Barcode': 'HK-105' }),
  asset({ Name: 'Exhaust fan', ID: '81006', Status: 'Online', Location: 'Roof', 'QR/Barcode': 'HK-106', Criticality: 'Urgent' }),
])

const PART_COLUMNS = ['ID', 'Area', 'Assets', 'QR/Barcode', 'Description', 'Location', 'Name', 'Part Numbers', 'Teams Assigned To', 'Thumbnail', 'Attachments', 'Types', 'URL', 'Minimum Quantity', 'Quantity', 'Reserved Quantity', 'Ordered Quantity', 'Unit Cost', 'Total Cost', 'Vendors', 'Created by', 'Created on', 'Last updated', 'Unique Identifier', 'Last Cycle Count', 'Available Quantity', 'Custom Fields']
const part = values => PART_COLUMNS.map(column => values[column] ?? '')

export const partsCsv = csv([PART_COLUMNS,
  part({ ID: '5001', Name: 'Door gasket, blast chiller', 'Part Numbers': 'GSK-BC20', Quantity: '2', 'Minimum Quantity': '1', Location: 'Store room shelf B', 'Unit Cost': '86.00' }),
  part({ ID: '5002', Name: 'Rinse aid, 5 L', 'Part Numbers': 'RA-5L, RA-5L-ALT', Quantity: '3.5', 'Minimum Quantity': '2', Location: 'Chemical store' }),
  part({ ID: '5003', Name: 'Oven door seal', Quantity: '0', 'Minimum Quantity': '1' }),
  part({ ID: '5004', Name: 'Thermostat probe', 'Part Numbers': 'TP-9', Quantity: 'lots' }),
])

const READING_COLUMNS = ['Meter Name', 'Meter ID', 'Asset Name', 'Location Name', 'Unit of Measure (U/M)', 'Reading', 'Entered On', 'Entered By', 'Work Order #', 'Work Order Title', 'Work Order URL']
const reading = values => READING_COLUMNS.map(column => values[column] ?? '')

// Newest first, as the export lists them; Gasket checks a counter in date order.
export const readingsCsv = csv([READING_COLUMNS,
  reading({ 'Meter Name': 'Compressor run hours', 'Meter ID': 'M-9001', 'Asset Name': 'Blast chiller', 'Location Name': 'Cold prep', 'Unit of Measure (U/M)': 'hours', Reading: '8500', 'Entered On': '04/15/2026 09:00 AM', 'Entered By': 'Sam Ito' }),
  reading({ 'Meter Name': 'Compressor run hours', 'Meter ID': 'M-9001', 'Asset Name': 'Blast chiller', 'Location Name': 'Cold prep', 'Unit of Measure (U/M)': 'hours', Reading: '8,655', 'Entered On': '04/01/2026 08:05 AM', 'Entered By': 'Dana Reyes', 'Work Order #': '412' }),
  reading({ 'Meter Name': 'Compressor run hours', 'Meter ID': 'M-9001', 'Asset Name': 'Blast chiller', 'Location Name': 'Cold prep', 'Unit of Measure (U/M)': 'hours', Reading: '8210', 'Entered On': '03/02/2026 08:00 AM', 'Entered By': 'Dana Reyes' }),
  reading({ 'Meter Name': 'Cabinet temperature', 'Meter ID': 'M-9002', 'Asset Name': 'Blast chiller', 'Location Name': 'Cold prep', 'Unit of Measure (U/M)': '°C', Reading: '-18.5', 'Entered On': '04/01/2026 08:06 AM', 'Entered By': 'Dana Reyes' }),
  reading({ 'Meter Name': 'Core probe', 'Meter ID': 'M-9003', 'Asset Name': 'Salamander grill', 'Location Name': 'Hot line', 'Unit of Measure (U/M)': '°C', Reading: '75', 'Entered On': '04/02/2026 12:00 PM', 'Entered By': 'Dana Reyes' }),
])

// MIG-002: two assets and MaintainX's work-order export (columns from MaintainX's "Work Order Exports" list), in two date ranges.
export const historyAssetsCsv = csv([ASSET_COLUMNS,
  asset({ Name: 'Walk-in freezer', ID: '82001', Status: 'Online', Location: 'Back of house', 'QR/Barcode': 'HK-201', Criticality: 'Critical' }),
  asset({ Name: 'Twin-basket fryer', ID: '82002', Status: 'Online', Location: 'Hot line', 'QR/Barcode': 'HK-202', Criticality: 'Important' }),
])

const WORK_COLUMNS = ['ID', 'Title', 'Status', 'Priority', 'Work Type', 'Description', 'URL', 'Global ID', 'Assigned to', 'Teams Assigned to', 'Requested by', 'Requested on', 'Created by', 'Created on', 'Planned Start Date', 'Estimated Time', 'Due Date', 'Started on', 'Completed on', 'Completed by', 'Last updated', 'Recurrence', 'Location', 'Location ID', 'Asset', 'Asset ID', 'Categories', 'Vendors', 'Vendor IDs', 'Procedure Name', 'Procedure Template ID', 'Procedure Passes', 'Procedure Flags', 'Procedure Failures', 'Procedure Score', 'Additional Costs', 'Total Parts Cost', 'Total Time Cost', 'Total Reported Time', 'Time to Complete', 'Request ID', 'Attachments']
const work = values => WORK_COLUMNS.map(column => values[column] ?? '')
const quarterly = work({ ID: '7001', Title: 'Quarterly freezer service', Status: 'Done', 'Work Type': 'Preventive', Asset: 'Walk-in freezer', 'Asset ID': '82001', 'Completed on': '02/10/2026 03:30 PM', 'Completed by': 'Dana Reyes', 'Assigned to': 'Dana Reyes', Categories: 'Refrigeration', Recurrence: 'Every 3 months', 'Total Parts Cost': '$86.00', 'Total Time Cost': '120' })

export const workCsv = csv([WORK_COLUMNS, quarterly,
  work({ ID: '7002', Title: 'Fryer will not heat', Status: 'Done', 'Work Type': 'Reactive', Asset: 'Twin-basket fryer', 'Asset ID': '82002', 'Completed on': '03/04/2026 10:15 AM', 'Completed by': 'Sam Ito', Categories: 'Electrical, Damage', 'Total Parts Cost': '$1,234.50' }),
  work({ ID: '7003', Title: 'Replace freezer door strip', Status: 'Open', 'Work Type': 'Reactive', Asset: 'Walk-in freezer', 'Asset ID': '82001' }),
  work({ ID: '7001', Title: 'Quarterly freezer service (copy)', Status: 'Done', Asset: 'Walk-in freezer', 'Asset ID': '82001', 'Completed on': '02/10/2026 03:30 PM' }),
  work({ ID: '7005', Title: 'Grill element', Status: 'Done', Asset: 'Salamander grill', 'Completed on': '03/05/2026 09:00 AM' }),
  work({ ID: '7006', Title: 'Fryer basket', Status: 'Done', Asset: 'Twin-basket fryer', 'Asset ID': '82002', 'Completed on': '03/06/2026 09:00 AM', 'Total Parts Cost': 'lots' }),
  work({ ID: '7007', Title: 'Booked ahead', Status: 'Done', Asset: 'Twin-basket fryer', 'Asset ID': '82002', 'Completed on': '12/31/2099 09:00 AM' }),
])

// The next date range overlaps the first by one completed work order.
export const laterWorkCsv = csv([WORK_COLUMNS, quarterly,
  work({ ID: '7008', Title: 'Quarterly freezer service', Status: 'Done', 'Work Type': 'Preventive', Asset: 'Walk-in freezer', 'Asset ID': '82001', 'Completed on': '05/12/2026 02:00 PM', 'Completed by': 'Dana Reyes', Recurrence: 'Every 3 months' }),
])

/** A small real PNG (1×1, grey) as inspection evidence. */
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==', 'base64')

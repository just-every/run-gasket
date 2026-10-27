import { insist } from '../core'
import { readCsv, type Table } from './csv'
import type { CellObject, WorkBook } from 'xlsx'

export type { Table } from './csv'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024
const MAX_SHEETS = 16
const MAX_ROWS = 20_000
const MAX_COLUMNS = 256
const MAX_CELLS = 200_000
const MAX_TEXT = 32_767

type SheetJS = typeof import('xlsx')
let parser: Promise<SheetJS> | undefined
function loadParser(): Promise<SheetJS> {
  // The ESM entry has no Node filesystem setup. Code pages preserve legacy XLS text.
  return parser ??= Promise.all([import('xlsx/xlsx.mjs'), import('xlsx/dist/cpexcel.full.mjs')])
    .then(([xlsx, codepages]) => { xlsx.set_cptable(codepages); return xlsx })
}

/** Check ZIP sizes before allowing SheetJS to inflate an XLSX container. Refuse ZIP64 and encryption. */
async function checkZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  for (; end >= Math.max(0, bytes.length - 65_557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break
  }
  insist(end >= 0 && end >= bytes.length - 65_557, 'spreadsheet_invalid_format')
  insist(view.getUint16(end + 4, true) === 0 && view.getUint16(end + 6, true) === 0, 'spreadsheet_invalid_format')
  const entries = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true), expanded = 0
  insist(entries > 0 && entries <= 512 && entries === view.getUint16(end + 8, true), 'spreadsheet_too_many_parts')
  insist(offset + view.getUint32(end + 12, true) === end, 'spreadsheet_invalid_format')
  for (let index = 0; index < entries; index++) {
    insist(offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50, 'spreadsheet_invalid_format')
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true)
    const local = view.getUint32(offset + 42, true)
    insist(!(flags & 0x2041) && (method === 0 || method === 8), 'spreadsheet_invalid_format')
    expanded += size
    insist(expanded <= MAX_EXPANDED_BYTES, 'spreadsheet_too_large')
    insist(local + 30 <= offset && view.getUint32(local, true) === 0x04034b50, 'spreadsheet_invalid_format')
    insist(view.getUint16(local + 8, true) === method && view.getUint16(local + 6, true) === flags, 'spreadsheet_invalid_format')
    const localExtra = local + 30 + view.getUint16(local + 26, true)
    const dataStart = localExtra + view.getUint16(local + 28, true)
    insist(dataStart + compressed <= offset, 'spreadsheet_invalid_format')
    // Reject ZIP64 overrides, which could change the sizes checked above.
    for (const [start, length] of [[offset + 46 + nameLength, extraLength], [localExtra, dataStart - localExtra]]) {
      for (let extra = start; extra < start + length;) {
        insist(extra + 4 <= start + length && view.getUint16(extra, true) !== 1, 'spreadsheet_invalid_format')
        extra += 4 + view.getUint16(extra + 2, true)
        insist(extra <= start + length, 'spreadsheet_invalid_format')
      }
    }
    if (!(flags & 8)) insist(view.getUint32(local + 18, true) === compressed && view.getUint32(local + 22, true) === size, 'spreadsheet_invalid_format')
    else insist(view.getUint32(local + 22, true) === 0 || view.getUint32(local + 22, true) === size, 'spreadsheet_invalid_format')
    if (method === 0) insist(compressed === size, 'spreadsheet_invalid_format')
    else {
      // Count actual inflation through a bounded stream before the synchronous parser.
      const stream = new Blob([bytes.slice(dataStart, dataStart + compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      const reader = stream.getReader()
      let actual = 0
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          actual += chunk.value.length
          insist(actual <= size, 'spreadsheet_too_large')
        }
        insist(actual === size, 'spreadsheet_invalid_format')
      } finally { await reader.cancel() }
    }
    offset += 46 + nameLength + extraLength + view.getUint16(offset + 32, true)
  }
  insist(offset === end, 'spreadsheet_invalid_format')
}

// SheetJS exposes container members through CFB; these are not in its public TS types.
type Container = { FullPaths: string[]; FileIndex: { content?: Uint8Array; size: number }[] }
function checkContainer(xlsx: SheetJS, bytes: Uint8Array, format: 'xls' | 'xlsx') {
  const container = xlsx.CFB.read(bytes, { type: 'array' }) as Container
  let workbookFound = false, expanded = 0
  for (let index = 0; index < container.FullPaths.length; index++) {
    const path = container.FullPaths[index].replace(/^[^/]*\//, '')
    const entry = container.FileIndex[index]
    expanded += entry.size || 0
    insist(expanded <= MAX_EXPANDED_BYTES, 'spreadsheet_too_large')
    if (!entry.content?.length) continue
    const content = Uint8Array.from(entry.content)
    if (format === 'xlsx') {
      insist(!/(?:externalLinks|vbaProject|connections\.xml)/i.test(path), 'spreadsheet_external_links')
      if (path === 'xl/workbook.xml') workbookFound = true
      if (/\.(?:xml|rels)$/i.test(path)) {
        const xml = new TextDecoder().decode(content)
        insist(!/<(?:[\w.-]+:)?(?:f|definedName)(?:\s|\/?>)/i.test(xml), 'spreadsheet_formulas')
        insist(!/<(?:[\w.-]+:)?externalReferences?(?:\s|\/?>)/i.test(xml), 'spreadsheet_external_links')
        for (const match of xml.matchAll(/\bTargetMode\s*=\s*(["'])(.*?)\1/gi)) {
          const mode = match[2].replace(/&#(?:x([\da-f]+)|(\d+));/gi,
            (_, hex: string | undefined, decimal: string | undefined) => {
              const code = parseInt(hex ?? decimal!, hex ? 16 : 10)
              return code <= 0x10ffff ? String.fromCodePoint(code) : ''
            })
          insist(mode.toLowerCase() !== 'external', 'spreadsheet_external_links')
        }
      }
    } else if (/^(?:Workbook|Book)$/i.test(path)) {
      workbookFound = true
      checkBiff(content)
    }
  }
  insist(workbookFound, 'spreadsheet_invalid_format')
}

/** BIFF records include formulas and external books even when outside the parsed row range. */
function checkBiff(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  while (offset + 4 <= bytes.length) {
    const record = view.getUint16(offset, true), size = view.getUint16(offset + 2, true)
    insist(offset + 4 + size <= bytes.length, 'spreadsheet_invalid_format')
    insist(![0x0006, 0x0206, 0x0406, 0x0221, 0x04bc, 0x00bc, 0x0018, 0x0218].includes(record), 'spreadsheet_formulas')
    // SupBook permits only the internal-workbook marker. HLink / ExternName are rejected.
    if (record === 0x01ae) insist(size >= 4 && view.getUint16(offset + 6, true) === 0x0401, 'spreadsheet_external_links')
    insist(record !== 0x01b8 && record !== 0x0023 && record !== 0x0223, 'spreadsheet_external_links')
    offset += 4 + size
  }
}

/** Excel wall-clock values have no timezone. Emit ISO dates and times without inventing one. */
function dateText(xlsx: SheetJS, value: number, format: string, date1904: boolean): string {
  const tokens = format.replace(/"[^"]*"|\\.|\[(?![hms]+\])[^\]]*\]/gi, '')
  const hasTime = /[hs]/i.test(tokens), hasDate = /[yd]/i.test(tokens) || (!hasTime && /m/i.test(tokens))
  // Elapsed durations are not ISO clock times; reject rather than discard elapsed days.
  insist(!/\[[hms]+\]/i.test(tokens), 'spreadsheet_invalid_date')
  insist(Number.isFinite(value) && (date1904 || Math.floor(value) !== 60), 'spreadsheet_invalid_date')
  const parts = xlsx.SSF.parse_date_code(Math.round(value * 86_400_000) / 86_400_000, { date1904 }) as
    { y: number; m: number; d: number; H: number; M: number; S: number; u: number } | null
  insist(parts, 'spreadsheet_invalid_date')
  const pad = (number: number, length = 2) => String(number).padStart(length, '0')
  const milliseconds = Math.round(parts.u * 1000)
  const time = `${pad(parts.H)}:${pad(parts.M)}:${pad(parts.S)}${milliseconds ? `.${pad(milliseconds, 3)}` : ''}`
  if (!hasDate) { insist(value < 1 && value >= 0, 'spreadsheet_invalid_date'); return time }
  insist(parts.y >= 1 && parts.y <= 9999 && parts.d >= 1, 'spreadsheet_invalid_date')
  const date = `${pad(parts.y, 4)}-${pad(parts.m)}-${pad(parts.d)}`
  return hasTime ? `${date}T${time}` : date
}

function cellText(xlsx: SheetJS, cell: CellObject, workbook: WorkBook): string {
  insist(cell.f === undefined && cell.F === undefined, 'spreadsheet_formulas')
  insist(!cell.l || cell.l.Target.startsWith('#'), 'spreadsheet_external_links')
  insist(cell.t !== 'e', 'spreadsheet_cell_error')
  let result: string
  if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && xlsx.SSF.is_date(cell.z)) {
    result = dateText(xlsx, cell.v, typeof cell.z === 'string' ? cell.z : xlsx.SSF.get_table()[cell.z], !!workbook.Workbook?.WBProps?.date1904)
  } else if (cell.t === 'd') {
    const date = cell.v instanceof Date ? cell.v : new Date(String(cell.v))
    insist(Number.isFinite(date.getTime()), 'spreadsheet_invalid_date')
    result = date.toISOString().replace(/\.000Z$/, '').replace(/Z$/, '')
  } else result = cell.t === 's' ? String(cell.v ?? '') : cell.w ?? String(cell.v ?? '')
  insist(result.length <= MAX_TEXT, 'spreadsheet_cell_too_long')
  return result
}

function checkTables(tables: Table[]) {
  let cells = 0
  insist(tables.length > 0 && tables.length <= MAX_SHEETS, 'spreadsheet_too_many_sheets')
  for (const table of tables) {
    insist(table.rows.length <= MAX_ROWS, 'spreadsheet_too_many_rows')
    for (const row of table.rows) {
      insist(row.length <= MAX_COLUMNS, 'spreadsheet_too_many_columns')
      cells += row.length
      insist(cells <= MAX_CELLS, 'spreadsheet_too_many_cells')
      insist(row.every(cell => cell.length <= MAX_TEXT), 'spreadsheet_cell_too_long')
    }
  }
  return tables
}

export async function readSpreadsheet(bytes: Uint8Array, filename: string): Promise<Table[]> {
  insist(bytes.length > 0 && bytes.length <= MAX_BYTES, 'spreadsheet_too_large')
  const format = filename.toLowerCase().match(/\.(csv|xls|xlsx)$/)?.[1]
  insist(format, 'spreadsheet_invalid_format')
  if (format === 'csv') return checkTables([readCsv(bytes, 'csv')])
  insist(format === 'xls' || format === 'xlsx', 'spreadsheet_invalid_format')
  if (format === 'xlsx') {
    insist(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4, 'spreadsheet_invalid_format')
    await checkZip(bytes)
  } else insist([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte), 'spreadsheet_invalid_format')
  const xlsx = await loadParser()
  checkContainer(xlsx, bytes, format)
  const metadata = xlsx.read(bytes, { type: 'array', bookSheets: true })
  insist(metadata.SheetNames.length > 0 && metadata.SheetNames.length <= MAX_SHEETS, 'spreadsheet_too_many_sheets')
  const workbook = xlsx.read(bytes, { type: 'array', cellFormula: true, cellNF: true, cellDates: false,
    cellText: true, cellHTML: false, sheetRows: MAX_ROWS + 1, WTF: true })
  let cells = 0
  const tables = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    insist(sheet && !sheet['!type'], 'spreadsheet_invalid_format')
    const rows: string[][] = []
    const addresses = Object.keys(sheet).filter(key => !key.startsWith('!'))
    let lastRow = -1, lastColumn = -1
    for (const address of addresses) {
      const position = xlsx.utils.decode_cell(address)
      insist(position.r < MAX_ROWS, 'spreadsheet_too_many_rows')
      insist(position.c < MAX_COLUMNS, 'spreadsheet_too_many_columns')
      lastRow = Math.max(lastRow, position.r); lastColumn = Math.max(lastColumn, position.c)
    }
    for (const reference of [sheet['!ref'], sheet['!fullref']]) if (reference) {
      const range = xlsx.utils.decode_range(reference)
      insist(range.e.r < MAX_ROWS, 'spreadsheet_too_many_rows')
      insist(range.e.c < MAX_COLUMNS, 'spreadsheet_too_many_columns')
    }
    cells += (lastRow + 1) * (lastColumn + 1)
    insist(cells <= MAX_CELLS, 'spreadsheet_too_many_cells')
    for (let row = 0; row <= lastRow; row++) {
      const values: string[] = []
      for (let column = 0; column <= lastColumn; column++) {
        const cell = sheet[xlsx.utils.encode_cell({ r: row, c: column })] as CellObject | undefined
        values.push(cell ? cellText(xlsx, cell, workbook) : '')
      }
      if (values.some(value => value.trim() !== '')) rows.push(values)
    }
    return { name, rows }
  })
  return checkTables(tables)
}

export async function spreadsheetTemplate(format: 'csv' | 'xls' | 'xlsx', sheet: string, header: string[]): Promise<Uint8Array> {
  insist(['csv', 'xls', 'xlsx'].includes(format), 'spreadsheet_invalid_format')
  insist(header.length > 0, 'spreadsheet_empty_header')
  checkTables([{ name: sheet, rows: [header] }])
  if (format === 'csv') return new TextEncoder().encode(header.map(value => `"${value.replace(/"/g, '""')}"`).join(',') + '\r\n')
  insist(sheet.length > 0 && sheet.length <= 31 && !/[\\/?*\[\]:]/.test(sheet), 'spreadsheet_invalid_sheet_name')
  const xlsx = await loadParser(), workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([header]), sheet)
  return new Uint8Array(xlsx.write(workbook, { bookType: format === 'xls' ? 'biff8' : 'xlsx', type: 'array', compression: true }))
}

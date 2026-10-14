// A bounded RFC 4180 CSV reader for incumbent exports (UTF-8, optional BOM).
import { insist } from '../core'

export type Table = { name: string; rows: string[][] }

export function readCsv(bytes: Uint8Array, name = 'csv'): Table {
  let text = ''
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { insist(false, 'csv_not_utf8') }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index++ }
      else if (character === '"') quoted = false
      else field += character
    } else if (character === '"' && field === '') quoted = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += character
  }
  insist(!quoted, 'csv_unterminated_quote')
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  insist(rows.length <= 20_000, 'csv_too_many_rows')
  return { name, rows: rows.filter(cells => cells.some(cell => cell.trim() !== '')) }
}

/** Reads cells by MaintainX's documented column names, matched case- and spacing-insensitively. */
export function columns(header: string[]) {
  const normal = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const index = new Map(header.map((name, position) => [normal(name), position]))
  return {
    has: (name: string) => index.has(normal(name)),
    get: (cells: string[], name: string) => { const position = index.get(normal(name)); return position === undefined ? '' : (cells[position] ?? '').trim() },
  }
}

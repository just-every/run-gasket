import { inflateSync } from 'node:zlib'
import { GasketError, insist } from './core'

const MAX_INFLATED = 64 * 1024 * 1024
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
function check(condition: unknown): asserts condition { insist(condition, 'invalid_photo') }
const u16 = (b: Uint8Array, p: number) => b[p] * 256 + b[p + 1]
const u32 = (b: Uint8Array, p: number) => (b[p] * 0x1000000 + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]) >>> 0
const ascii = (b: Uint8Array) => String.fromCharCode(...b)

function join(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of parts) { bytes.set(part, at); at += part.length }
  return bytes
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0)
  return n >>> 0
})
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function png(bytes: Uint8Array): Uint8Array {
  const kept = [bytes.subarray(0, 8)], compressed: Uint8Array[] = [], seen = new Set<string>()
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0, palette = 0, dataEnded = false
  for (let at = 8; at < bytes.length;) {
    check(at + 12 <= bytes.length)
    const length = u32(bytes, at), end = at + 12 + length
    check(end <= bytes.length)
    const type = ascii(bytes.subarray(at + 4, at + 8)), data = bytes.subarray(at + 8, end - 4)
    check(/^[A-Za-z]{4}$/.test(type) && type[2] === type[2].toUpperCase())
    check(crc32(bytes.subarray(at + 4, end - 4)) === u32(bytes, end - 4))
    check(seen.has('IHDR') || type === 'IHDR')
    if (compressed.length && type !== 'IDAT') dataEnded = true
    if (['IHDR', 'PLTE', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT'].includes(type)) check(!seen.has(type))
    if (type === 'IHDR') {
      check(at === 8 && length === 13)
      width = u32(data, 0); height = u32(data, 4); depth = data[8]; colour = data[9]; interlace = data[12]
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
      check(width > 0 && height > 0 && depths[colour]?.includes(depth))
      check(data[10] === 0 && data[11] === 0 && interlace <= 1)
    } else if (type === 'PLTE') {
      check(!compressed.length && !seen.has('tRNS') && colour !== 0 && colour !== 4)
      check(length >= 3 && length <= 768 && length % 3 === 0)
      palette = length / 3
      check(colour !== 3 || palette <= 2 ** depth)
    } else if (type === 'IDAT') {
      check(!dataEnded && (colour !== 3 || palette > 0))
      compressed.push(data)
    } else if (type === 'IEND') {
      check(length === 0 && compressed.length > 0 && end === bytes.length)
    } else if (type === 'tRNS') {
      check(!compressed.length && (colour === 0 ? length === 2 : colour === 2 ? length === 6 : colour === 3 && length > 0 && length <= palette))
    } else if (['gAMA', 'cHRM', 'sRGB', 'sBIT'].includes(type)) {
      check(!seen.has('PLTE') && !compressed.length)
      if (type === 'gAMA') check(length === 4 && u32(data, 0) > 0)
      if (type === 'cHRM') check(length === 32)
      if (type === 'sRGB') check(length === 1 && data[0] <= 3)
      if (type === 'sBIT') {
        check(length === ({ 0: 1, 2: 3, 3: 3, 4: 2, 6: 4 } as Record<number, number>)[colour])
        check(data.every(value => value > 0 && value <= (colour === 3 ? 8 : depth)))
      }
    } else check(type[0] === type[0].toLowerCase()) // Unknown critical chunks cannot be interpreted safely.
    if (['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT'].includes(type)) kept.push(bytes.subarray(at, end))
    seen.add(type); at = end
  }
  check(seen.has('IEND'))
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colour]
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]]
  const rows = passes.map(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy))
    return { size: Math.ceil(w * channels * depth / 8), count: w ? h : 0 }
  })
  const expected = rows.reduce((n, row) => n + (row.size + 1) * row.count, 0)
  check(expected > 0 && expected <= MAX_INFLATED)
  const input = join(compressed)
  // `info` also exposes consumed input: a valid zlib stream followed by junk is rejected.
  const result = inflateSync(input, { maxOutputLength: expected + 1, info: true }) as unknown as { buffer: Uint8Array; engine: { bytesWritten: number } }
  check(result.buffer.length === expected && result.engine.bytesWritten === input.length)
  let offset = 0
  for (const row of rows) for (let y = 0; y < row.count; y++) { check(result.buffer[offset] <= 4); offset += row.size + 1 }
  return join(kept)
}

type Component = { h: number; v: number; quant: number }

/** Validate JPEG framing, tables and scan boundaries without decoding pixels. */
function jpeg(bytes: Uint8Array): Uint8Array {
  const kept = [bytes.subarray(0, 2)], components = new Map<number, Component>()
  const quant = new Set<number>(), huffman = new Set<number>(), covered = new Set<number>()
  let at = 2, frame = 0, scans = 0, restartInterval = 0
  while (at < bytes.length) {
    const start = at
    check(bytes[at++] === 0xff)
    while (bytes[at] === 0xff) at++
    const marker = bytes[at++]
    check(marker > 0 && marker !== 0xd8 && marker !== 0x01 && !(marker >= 0xd0 && marker <= 0xd7))
    if (marker === 0xd9) {
      check(scans > 0 && covered.size === components.size && at === bytes.length)
      kept.push(bytes.subarray(start, at))
      return join(kept)
    }
    check(at + 2 <= bytes.length)
    const length = u16(bytes, at), end = at + length
    check(length >= 2 && end <= bytes.length)
    const data = bytes.subarray(at + 2, end)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      check(!frame && !scans && data.length >= 9 && data[0] === 8)
      const height = u16(data, 1), width = u16(data, 3), count = data[5]
      check(width > 0 && height > 0 && count >= 1 && count <= 4 && data.length === 6 + count * 3)
      let blocks = 0
      for (let i = 6; i < data.length; i += 3) {
        const id = data[i], h = data[i + 1] >> 4, v = data[i + 1] & 15, q = data[i + 2]
        check(!components.has(id) && h >= 1 && h <= 4 && v >= 1 && v <= 4 && q <= 3)
        components.set(id, { h, v, quant: q }); blocks += h * v
      }
      check(blocks <= 10)
      frame = marker
    } else if (marker === 0xdb) {
      check(data.length > 0)
      for (let p = 0; p < data.length;) {
        const precision = data[p] >> 4, id = data[p++] & 15, size = precision ? 128 : 64
        check(precision <= 1 && id <= 3 && p + size <= data.length)
        for (let i = 0; i < size; i += precision + 1) check(precision ? u16(data, p + i) > 0 : data[p + i] > 0)
        quant.add(id); p += size
      }
    } else if (marker === 0xc4) {
      check(data.length > 0)
      for (let p = 0; p < data.length;) {
        const table = data[p++], kind = table >> 4, id = table & 15
        check(kind <= 1 && id <= 3 && p + 16 <= data.length)
        const counts = data.subarray(p, p + 16); p += 16
        const count = counts.reduce((sum, n) => sum + n, 0)
        check(count > 0 && count <= 256 && p + count <= data.length)
        let free = 1
        for (const n of counts) { free = free * 2 - n; check(free > 0) }
        for (const symbol of data.subarray(p, p + count)) check(kind ? (symbol & 15) <= 10 : symbol <= 11)
        huffman.add(table); p += count
      }
    } else if (marker === 0xdd) {
      check(data.length === 2); restartInterval = u16(data, 0)
    } else if (marker === 0xda) {
      check(frame && data.length >= 6)
      const count = data[0], selected = new Set<number>()
      check(count >= 1 && count <= components.size && data.length === 4 + count * 2)
      const ss = data[data.length - 3], se = data[data.length - 2], ah = data[data.length - 1] >> 4, al = data[data.length - 1] & 15
      check(frame === 0xc2 ? ss <= se && se <= 63 && (ss === 0 ? se === 0 : count === 1) && ah <= 13 && al <= 13 && (ah === 0 || ah === al + 1) : ss === 0 && se === 63 && ah === 0 && al === 0)
      for (let p = 1; p < 1 + count * 2; p += 2) {
        const id = data[p], component = components.get(id), dc = data[p + 1] >> 4, ac = data[p + 1] & 15
        check(component && !selected.has(id) && dc <= 3 && ac <= 3 && quant.has(component.quant))
        check((ss !== 0 || ah !== 0 || huffman.has(dc)) && (se === 0 || huffman.has(16 + ac)))
        check(frame === 0xc2 || !covered.has(id))
        selected.add(id); if (ss === 0) covered.add(id)
      }
      kept.push(bytes.subarray(start, end))
      at = end
      let entropy = 0, restart = 0
      while (at < bytes.length) {
        if (bytes[at] !== 0xff) { entropy++; at++; continue }
        const boundary = at++
        if (bytes[at] === 0) { entropy++; at++; continue }
        while (bytes[at] === 0xff) at++
        const code = bytes[at]
        if (code >= 0xd0 && code <= 0xd7) {
          check(restartInterval > 0 && code === 0xd0 + (restart++ % 8) && entropy > 0)
          at++; continue
        }
        check(code !== 0 && code !== undefined)
        at = boundary
        break
      }
      check(entropy > 0 && at < bytes.length)
      kept.push(bytes.subarray(end, at)); scans++
      check(scans <= 256)
      continue
    } else {
      // APPn and comments are metadata. Keep only the fixed Adobe colour transform.
      check((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)
      if (marker === 0xee && data.length === 12 && ascii(data.subarray(0, 5)) === 'Adobe' && data[11] <= 2) {
        kept.push(bytes.subarray(start, end))
      }
      at = end; continue
    }
    kept.push(bytes.subarray(start, end)); at = end
  }
  check(false)
  return bytes
}

/** Content-sniffed request photos. Metadata is removed before hashing or storage. */
export function sanitiseRequestPhoto(bytes: Uint8Array): { bytes: Uint8Array; mediaType: string } {
  try {
    check(bytes.length > 0 && bytes.length <= 1_500_000)
    if (PNG_SIGNATURE.every((value, i) => bytes[i] === value)) return { bytes: png(bytes), mediaType: 'image/png' }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes: jpeg(bytes), mediaType: 'image/jpeg' }
    check(false)
  } catch { throw new GasketError('invalid_photo') }
  throw new GasketError('invalid_photo')
}

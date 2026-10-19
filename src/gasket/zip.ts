// A ZIP archive of stored (uncompressed) entries, for downloads such as the
// ASSET-003 job pack. Entry names are UTF-8; times are left at the DOS epoch.
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export function zip(entries: { path: string; bytes: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(), locals: Uint8Array[] = [], centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.path), crc = crc32(entry.bytes), size = entry.bytes.length
    const header = (central: boolean) => {
      const out = new Uint8Array((central ? 46 : 30) + name.length), view = new DataView(out.buffer)
      view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true)
      let at = 4
      if (central) { view.setUint16(at, 20, true); at += 2 }
      view.setUint16(at, 20, true); view.setUint16(at + 2, 0x0800, true) // version needed; UTF-8 names
      view.setUint32(at + 10, crc, true); view.setUint32(at + 14, size, true); view.setUint32(at + 18, size, true); view.setUint16(at + 22, name.length, true)
      if (central) view.setUint32(42, offset, true)
      out.set(name, central ? 46 : 30)
      return out
    }
    const local = header(false)
    locals.push(local, entry.bytes); centrals.push(header(true))
    offset += local.length + size
  }
  const directory = centrals.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true); view.setUint32(12, directory, true); view.setUint32(16, offset, true)
  const out = new Uint8Array(offset + directory + 22)
  let at = 0
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length }
  return out
}

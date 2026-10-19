// FIELD-005: annotations over a work order's photos. Each is a box, ellipse or
// arrow placed in percent of the photo's width and height (two decimals, kept
// as hundredths of a percent) with a note. The original file and its digest
// never change; the work page draws the shapes over the photo when its pixel
// size is known (PNG and JPEG), and lists them either way.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { touch, workable } from './work'

export const SHAPES = ['box', 'ellipse', 'arrow'] as const

/** A photo's pixel size from its PNG header or JPEG frame header; null for other types or unreadable files. */
export function imageSize(bytes: Uint8Array, mediaType: string): { width: number; height: number } | null {
  if (mediaType === 'image/png' && bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mediaType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 9 < bytes.length;) {
      if (bytes[at] !== 0xff) return null
      const marker = bytes[at + 1], length = (bytes[at + 2] << 8) | bytes[at + 3]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] }
      at += 2 + length
    }
  }
  return null
}

const percent = (input: Input, name: string) => {
  const value = input.text(name, { max: 6 })
  insist(/^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100, `invalid_${name}`)
  return Math.round(Number(value) * 100)
}

/** The person doing the work marks a photo: a box or ellipse from its top-left (x1, y1) to bottom-right (x2, y2) corner, or an arrow from (x1, y1) to its head at (x2, y2). */
export async function annotate(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const photo = await one(env, 'SELECT id, media_type FROM gk_evidence WHERE id = ? AND work_order_id = ?', input.text('evidence', { max: 100 }), order.id)
  insist(photo, 'evidence_not_found', 404)
  insist(String(photo.media_type).startsWith('image/'), 'photo_required')
  const shape = input.text('shape', { max: 10 }) as typeof SHAPES[number]
  insist(SHAPES.includes(shape), 'invalid_shape')
  const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(name => percent(input, name))
  insist(shape === 'arrow' ? x1 !== x2 || y1 !== y2 : x1 < x2 && y1 < y2, 'invalid_shape')
  const note = input.text('note', { max: 300 }), id = newId()
  await commit(env, [...touch(env, order), stmt(env, 'INSERT INTO gk_annotations (id, evidence_id, work_order_id, shape, x1, y1, x2, y2, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, photo.id, order.id, shape, x1, y1, x2, y2, note, actor.id, now())],
    { actor: actor.id, action: 'workorder.annotate', subject: order.id, detail: { evidence: photo.id, annotation: id, shape, x1: x1 / 100, y1: y1 / 100, x2: x2 / 100, y2: y2 / 100, note } })
  return { id: order.id, annotation: id }
}

export const annotationsOf = (env: Bindings, workOrderId: string) =>
  all(env, 'SELECT n.id, n.evidence_id, n.shape, n.x1 / 100.0 AS x1, n.y1 / 100.0 AS y1, n.x2 / 100.0 AS x2, n.y2 / 100.0 AS y2, n.note, m.name AS created_by, n.created_at FROM gk_annotations n LEFT JOIN gk_members m ON m.id = n.created_by WHERE n.work_order_id = ? ORDER BY n.created_at, n.rowid', workOrderId)

// PART-008: catalog photos retain their original bytes and digest behind native sign-in.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { commit, insist, newId, now, one, sha256Hex, stmt } from './core'
import type { Input } from './input'
import { canonicalPart } from './part-identity'

export async function addPartPhoto(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'register.manage')
  const part=await canonicalPart(env,input.text('part')), file=(await input.file('photo',{maxBytes:1_500_000}))!
  const b=file.bytes
  const type=b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71 ? 'image/png' : b[0]===255 && b[1]===216 && b[2]===255 ? 'image/jpeg' : String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP' ? 'image/webp' : null
  insist(type,'unsupported_photo')
  const id=newId(),hash=await sha256Hex(b)
  await commit(env,[stmt(env,'INSERT INTO gk_part_photos(id,part_id,filename,media_type,sha256,bytes,added_by,added_at) VALUES (?,?,?,?,?,?,?,?)',id,part.id,file.filename,type,hash,b,actor.id,now())],{actor:actor.id,action:'part.photo',subject:part.id,detail:{photo:id,sha256:hash}})
  return {id:part.id,photo:id,sha256:hash}
}
export async function partPhoto(env: Bindings, _actor: Actor, id: string) {
  const photo=await one(env,'SELECT * FROM gk_part_photos WHERE id=?',id)
  insist(photo,'photo_not_found',404)
  return new Response(new Uint8Array(photo.bytes),{headers:{'content-security-policy':"default-src 'none'; img-src 'self'; sandbox",'content-type':photo.media_type,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':`inline; filename="${photo.filename.replace(/[^\w.-]/g,'_')}"`}})
}

import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontData from '../../public/fonts/inter/inter-report.ttf?inline'
import { insist } from './core'
import { printText } from './print-catalog'
import { lineOf } from './steps'
import type { PackContent } from './print-packs'

/** Fixed printable pages repeat the immutable identity; authored text is wrapped, never truncated. */
export async function printPdf(content: PackContent, digest: string) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Uint8Array.from(atob(fontData.slice(fontData.indexOf(',') + 1)), c => c.charCodeAt(0)), { subset: false })
  const glyphs = new Set(font.getCharacterSet()), t = printText(content.locale)
  let page = pdf.addPage([595.28, 841.89]), y = 784
  const next = () => { page = pdf.addPage([595.28, 841.89]); y = 784 }
  const line = (value: string, size = 13) => {
    insist([...value].every(c => ['\n','\r','\t'].includes(c) || glyphs.has(c.codePointAt(0)!)), 'pdf_character_not_supported', 422)
    for (const paragraph of value.replace(/\r\n?/g,'\n').split('\n')) {
      let text = ''
      const draw = () => { if (y < 100) next(); page.drawText(text,{x:42,y,size,font,color:rgb(.12,.13,.15)}); y -= size+7; text='' }
      for (const c of paragraph.replace(/\t/g,'    ')) { if(text && font.widthOfTextAtSize(text+c,size)>510) draw(); text+=c }
      draw()
    }
  }
  pdf.setTitle(`${content.workNumber} ${t('title')}`); pdf.setLanguage(content.locale)
  line(`${content.workNumber} ${content.title}`,17)
  line(`${t('issuer')}: ${content.issuerName} (${content.issuer})`)
  line(`${t('issued')}: ${new Date(content.issuedAt).toISOString()}`)
  line(t('warning')); line(t('limitations'))
  line(t('instructions'),15); line(content.instructions)
  for (const [i,step] of content.steps.entries()) { line(`${i+1}. ${lineOf(step,content.steps)}`); line(`${t('notes')}: ______________________________________`); line('____________________________________________________') }
  line(`${t('performed')}: ___________________________________`)
  const pages=pdf.getPages()
  for(const [i,p] of pages.entries()) {
    p.drawText(`${content.workNumber} | ${t('revision')} ${content.workVersion} | ${t('checklist')} ${content.checklistNumber}`,{x:42,y:72,size:13,font})
    p.drawText(`${content.id} | ${i+1} / ${pages.length}`,{x:42,y:52,size:13,font})
    p.drawText(digest,{x:42,y:30,size:11,font})
  }
  return pdf.save({objectsPerTick:Infinity})
}

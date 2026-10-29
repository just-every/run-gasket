import type { Locale } from './languages'
import { kindOf, type ChecklistItem } from './steps'
const en = {
  printView:'Browser print view', title: 'Controlled print packs', issue: 'Issue print pack', open: 'Open print pack', download: 'Download printable PDF',
  entry: 'Enter paper results', preview: 'Preview paper entry', confirm: 'Accept paper entry', back: 'Back to work',
  warning: 'A printed identifier grants no access. Enter results online while assigned to this work. Ordinary completion, safety and independent review still apply.',
  paper: 'Paper original', performed: 'Work performed at (site time)', performedHint: 'Declare when the work was performed, separately from this online entry.',
  result: 'Result', value: 'Value', note: 'Note', pass: 'Pass', attention: 'Needs attention', fail: 'Fail', blank: 'No entry',
  previewHint: 'Preview only. No work results, evidence or follow-ups have been accepted. Review these values and the original before confirming.',
  accepted: 'Paper entry accepted', saved: 'Saved. The server confirmed this submission.', none: 'Nothing was accepted by this request.',
  unconfirmed: 'Check the durable paper-entry receipt before retrying. Reuse the same preview to avoid duplicate effects.',
  stale: 'This pack names an older work version. Issue a new pack from current work before entering results.',
  original: 'Download paper original', issuer: 'Issued by', issued: 'Issued at', work: 'Work', revision: 'Work version', checklist: 'Checklist revision',
  digest: 'Content SHA-256', originalDigest: 'Original SHA-256', entrant: 'Entered by', entered: 'Entered at', receipt: 'Durable receipt',
  limitations: 'Paper entry supports non-meter checklist results and notes. It does not record meter readings, stock, labor, safety attestations or step photos.',
  pending: 'Accepted results remain subject to normal completion and independent review.',
  error_access: 'Your current session, membership or assignment does not allow this action.',
  error_stale: 'The work or pack changed. Reload current work and issue a new pack; no paper entry was accepted.',
  error_reused: 'This submission identity already names different content. Reuse the original preview or start a new entry.',
  error_invalid: 'Check the results, performed time and supported paper original. No paper entry was accepted.',
  error_generic: 'The paper action could not be confirmed. Inspect its receipt before retrying.',
  page: 'Page', instructions: 'Instructions', notes: 'Results and notes',
  step_check: 'Pass, needs attention or fail', step_text: 'Text', step_photo: 'Photo required',
  step_number: 'Number in {unit}', step_range: ', {min} to {max}', step_min: ', at least {min}', step_max: ', at most {max}',
  step_options: 'One of: {options}', step_failure: '; fails: {options}', step_when: '; only when step {step} is {answer}',
  step_inside: 'within its limits', step_outside: 'outside its limits',
} as const
const es: Record<keyof typeof en, string> = {
  printView:'Vista de impresión del navegador',title:'Paquetes de impresión controlados',issue:'Emitir paquete impreso',open:'Abrir paquete impreso',download:'Descargar PDF imprimible',
  entry:'Ingresar resultados en papel',preview:'Vista previa de la entrada',confirm:'Aceptar entrada en papel',back:'Volver al trabajo',
  warning:'El identificador impreso no concede acceso. Ingrese los resultados en línea mientras esté asignado a este trabajo. Se mantienen los requisitos de finalización, seguridad y revisión independiente.',
  paper:'Original en papel',performed:'Trabajo realizado a las (hora del sitio)',performedHint:'Declare cuándo se realizó el trabajo, por separado de esta entrada en línea.',
  result:'Resultado',value:'Valor',note:'Nota',pass:'Aprobado',attention:'Requiere atención',fail:'Falló',blank:'Sin entrada',
  previewHint:'Solo vista previa. No se han aceptado resultados, evidencia ni trabajos de seguimiento. Revise estos valores y el original antes de confirmar.',
  accepted:'Entrada en papel aceptada',saved:'Guardado. El servidor confirmó este envío.',none:'Esta solicitud no aceptó ningún dato.',
  unconfirmed:'Consulte el recibo duradero antes de reintentar. Reutilice la misma vista previa para evitar efectos duplicados.',
  stale:'Este paquete corresponde a una versión anterior del trabajo. Emita un paquete nuevo del trabajo actual antes de ingresar resultados.',
  original:'Descargar original en papel',issuer:'Emitido por',issued:'Fecha de emisión',work:'Trabajo',revision:'Versión del trabajo',checklist:'Revisión de la lista',
  digest:'SHA-256 del contenido',originalDigest:'SHA-256 del original',entrant:'Ingresado por',entered:'Fecha de ingreso',receipt:'Recibo duradero',
  limitations:'La entrada en papel admite resultados y notas de listas sin medidores. No registra lecturas de medidores, existencias, mano de obra, declaraciones de seguridad ni fotos de pasos.',
  pending:'Los resultados aceptados siguen sujetos a la finalización normal y a una revisión independiente.',
  error_access:'Su sesión, membresía o asignación actual no permite esta acción.',
  error_stale:'El trabajo o el paquete cambió. Vuelva a cargar el trabajo actual y emita un paquete nuevo; no se aceptó ninguna entrada en papel.',
  error_reused:'Esta identidad de envío ya corresponde a otro contenido. Reutilice la vista previa original o inicie otra entrada.',
  error_invalid:'Revise los resultados, la hora de realización y el original en papel admitido. No se aceptó ninguna entrada en papel.',
  error_generic:'No se pudo confirmar la acción en papel. Consulte su recibo antes de reintentar.',
  page:'Página',instructions:'Instrucciones',notes:'Resultados y notas',
  step_check:'Aprobado, requiere atención o falló',step_text:'Texto',step_photo:'Foto obligatoria',
  step_number:'Número en {unit}',step_range:', de {min} a {max}',step_min:', al menos {min}',step_max:', como máximo {max}',
  step_options:'Una de: {options}',step_failure:'; falla: {options}',step_when:'; condición del paso {step}: {answer}',
  step_inside:'dentro de sus límites',step_outside:'fuera de sus límites',
}
export type PrintKey = keyof typeof en
export const printText = (locale: Locale) => (key: PrintKey) => (locale === 'es-US' ? es : en)[key]

/** Translate interface guidance while retaining authored step labels, units and choices. */
export function printStepSummary(locale: Locale, step: ChecklistItem, steps: ChecklistItem[]) {
  const t=printText(locale)
  const format=(key:PrintKey,values:Record<string,string>)=>t(key).replace(/\{(\w+)\}/g,(_,name)=>values[name])
  const kind=kindOf(step)
  let summary:string=kind==='check'?t('step_check'):kind==='photo'?t('step_photo'):kind==='text'?t('step_text'):
    kind==='option'?format('step_options',{options:step.options!.join(', ')}):format('step_number',{unit:step.unit!})
  if(kind==='number') {
    if(step.min!==undefined&&step.max!==undefined)summary+=format('step_range',{min:step.min,max:step.max})
    else if(step.min!==undefined)summary+=format('step_min',{min:step.min})
    else if(step.max!==undefined)summary+=format('step_max',{max:step.max})
  }
  if(step.failOn?.length)summary+=format('step_failure',{options:step.failOn.join(', ')})
  if(step.when) {
    const at=steps.findIndex(other=>other.key===step.when!.step),earlier=kindOf(steps[at]),value=step.when.is
    const answer=earlier==='option'?value:earlier==='number'?t(value==='pass'?'step_inside':'step_outside'):
      t(value==='attention'?'attention':value==='pass'?'pass':'fail')
    summary+=format('step_when',{step:String(at+1),answer})
  }
  return summary
}
export const printStepLine=(locale:Locale,step:ChecklistItem,steps:ChecklistItem[])=>`${step.text} · ${printStepSummary(locale,step,steps)}`
export function printError(locale: Locale, code: string) {
  const key = /access|forbidden|not_your_work|authentication|not_a_member|save_receipt_not_found/.test(code) ? 'error_access'
    : /stale|pack_mismatch|work_order_not_open/.test(code) ? 'error_stale'
    : /reused|save_already_attempted/.test(code) ? 'error_reused'
    : /invalid|missing|too_long|file|meter|outcome|step|unexpected|no_checklist/.test(code) ? 'error_invalid' : 'error_generic'
  return printText(locale)(key)
}

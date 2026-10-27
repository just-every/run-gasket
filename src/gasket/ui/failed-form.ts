// Return the authorized source page with its exact submitted draft, without device storage.
import type { Input } from '../input'
import { newId } from '../core'
import { esc, field, fileField, h, hidden } from './html'

export async function failedForm(source: Response, action: string, input: Input, message: string, receipt: string, retry: boolean, status = 400) {
  const entries = input.entries(), values = (name: string) => entries.filter(([key]) => key === name).map(([, value]) => value)
  const selector = `form[action="${action}"]`
  const html = await source.text()
  // A page may have several forms for one action; identify the submitted hidden record and verb.
  let index = -1, active = -1
  const scores: number[] = [], formIds: string[] = []
  await new HTMLRewriter().on(selector, { element(element) { active = ++index; scores[active] = 0; formIds[active] = element.getAttribute('id') || ''; element.onEndTag(() => { active = -1 }) } })
    .on(`${selector} input[type="hidden"]`, { element(element) {
      const name = element.getAttribute('name') || ''
      if (active >= 0 && !['returnTo', '__gk_save'].includes(name)) scores[active] += values(name).includes(element.getAttribute('value') || '') ? 1 : -1
    } }).transform(new Response(html)).text()
  const chosen = scores.indexOf(Math.max(...scores))
  if (chosen < 0) return null
  index = -1; active = -1
  const positions = new Map<string, number>(), files = await draftFiles(input)
  const nextId = retry ? newId() : String(values('__gk_save')[0] || '')
  const error = h`<div id="save-error" class="gk-flash gk-error" role="alert" tabindex="-1" autofocus><p>${message}</p><p>Your entries are still in this form. <a href="${receipt}" target="_blank" rel="noopener">Check save receipt</a>.</p>${retry ? '' : h`<p>Do not repeat this submission. Inspect its saved steps first.</p>`}</div>`
  let selectName = '', selectPosition = 0
  const rewriter = new HTMLRewriter().on(selector, { element(element) {
    active = ++index
    if (active !== chosen) return
    element.prepend(error.html, { html: true })
    if (files.length) element.append(hidden('__gk_files', JSON.stringify(files)).html, { html: true })
    element.onEndTag(() => { active = -1 })
  } }).on(`${selector} input`, { element(element) {
    if (active !== chosen) return
    const name = element.getAttribute('name') || '', type = element.getAttribute('type') || 'text'
    if (name === '__gk_save') { element.setAttribute('value', nextId); return }
    if (type === 'file') {
      const kept = files.filter(file => file.name === name)
      if (kept.length) { element.removeAttribute('required'); element.after(`<p class="gk-hint">Kept attachment: ${kept.map(file => esc(file.filename)).join(', ')}. Choose a file to replace it.</p>`, { html: true }) }
      return
    }
    const submitted = values(name).filter(value => typeof value === 'string') as string[]
    if (['checkbox', 'radio'].includes(type)) {
      if (submitted.includes(element.getAttribute('value') || 'on')) element.setAttribute('checked', '')
      else element.removeAttribute('checked')
    } else {
      const position = positions.get(name) || 0; positions.set(name, position + 1)
      if (submitted[position] !== undefined) element.setAttribute('value', submitted[position])
    }
  } }).on(`${selector} textarea`, { element(element) {
    if (active !== chosen) return
    const name = element.getAttribute('name') || '', position = positions.get(name) || 0; positions.set(name, position + 1)
    element.setInnerContent(String(values(name)[position] ?? ''))
  } }).on(`${selector} select`, { element(element) {
    if (active !== chosen) return
    selectName = element.getAttribute('name') || ''
    selectPosition = positions.get(selectName) || 0; positions.set(selectName, selectPosition + 1)
    element.onEndTag(() => { selectName = '' })
  } }).on(`${selector} option`, { element(element) {
    if (active !== chosen || !selectName) return
    if (values(selectName)[selectPosition] === (element.getAttribute('value') || '')) element.setAttribute('selected', '')
    else element.removeAttribute('selected')
  } }).on(`${selector} noscript a`, { element(element) {
    if (active !== chosen) return
    const href = element.getAttribute('href') || ''
    if (href.startsWith('/app/save-receipts/')) element.setAttribute('href', `/app/save-receipts/${nextId}`)
    else if (action.startsWith('/request/') && href.startsWith(`${action}/received/`)) element.setAttribute('href', receipt)
  } }).on(`${selector} button[type="submit"]`, { element(element) {
    if (active === chosen && !retry) element.setAttribute('disabled', '')
  } })
  // A role selector can belong to its row form while appearing in another table cell.
  const associated = formIds[chosen]
  if (associated && /^[a-z0-9_-]+$/i.test(associated)) {
    let name = ''
    rewriter.on(`select[form="${associated}"]`, { element(element) {
      name = element.getAttribute('name') || ''
      element.onEndTag(() => { name = '' })
    } }).on(`select[form="${associated}"] option`, { element(element) {
      if (values(name).includes(element.getAttribute('value') || '')) element.setAttribute('selected', '')
      else element.removeAttribute('selected')
    } })
  }
  const response = rewriter.transform(new Response(html, { headers: source.headers, status }))
  response.headers.set('cache-control', 'no-store')
  return response
}

async function draftFiles(input: Input) {
  const files: { name: string; filename: string; type: string; base64: string }[] = []
  for (const [name, value] of input.entries()) if (value instanceof File && value.size) {
    const bytes = new Uint8Array(await value.arrayBuffer())
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
    files.push({ name, filename: value.name, type: value.type, base64: btoa(binary) })
  }
  return files
}

/** If access or the source form changed, keep only values this request submitted. */
export async function retainedForm(action: string, input: Input, message: string, receipt = '', retry = true) {
  const files = await draftFiles(input)
  const label = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, character => character.toUpperCase())
  return h`<div id="save-error" class="gk-flash gk-error" role="alert" tabindex="-1" autofocus>${message}</div>
    <p>Your submitted draft is kept below. <a href="/signin" target="_blank" rel="noopener">Sign in in a new tab</a> before retrying.${receipt ? h` <a href="${receipt}" target="_blank" rel="noopener">Check save receipt</a>.` : ''}</p>
    <form method="post" action="${action}" class="gk-form" enctype="${['multipart', 'form-data'].join('/')}">
      ${input.entries().filter(([, value]) => typeof value === 'string').map(([name, value]) => /^(?:__|returnTo$|version$|revision$|base64$|.*[Ii]d$)/.test(name) ? hidden(name, name === '__gk_save' && retry ? newId() : value) : field(label(name), name, { value, required: false }))}
      ${files.length ? hidden('__gk_files', JSON.stringify(files)) : ''}
      ${[...new Set(files.map(file => file.name))].map(name => h`<p>Kept attachment: ${files.filter(file => file.name === name).map(file => file.filename).join(', ')}</p>${fileField(label(name), name)}`)}
      <button type="submit"${retry ? '' : h` disabled`}>Retry retained draft</button>
    </form>`
}

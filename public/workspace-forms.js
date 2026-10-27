// Keep entered text, selections and files in the current page until a save is confirmed.
// Drafts are held only in this tab's live form, with no new device storage.
document.addEventListener('submit', async event => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || form.method !== 'post' || !new URL(form.action).pathname.startsWith('/app/do/')) return
  event.preventDefault()
  if (form.dataset.saving) return
  const body = new FormData(form, event.submitter)
  form.dataset.saving = 'yes'
  form.setAttribute('aria-busy', 'true')
  let message
  try {
    const response = await fetch(form.action, { method: 'POST', body, headers: { accept: ['application', 'json'].join('/') } })
    const result = await response.json()
    if (response.ok && result.saved === true) {
      const destination = new URL(result.destination, location.origin)
      if (destination.origin !== location.origin || !destination.pathname.startsWith('/app')) throw new Error('Invalid save destination')
      destination.searchParams.set('notice', result.notice || 'Saved.')
      location.assign(destination)
      return
    }
    message = typeof result.error === 'string' ? result.error : 'The server could not complete this save.'
  } catch {
    message = 'The connection ended before a save confirmation arrived.'
  } finally {
    delete form.dataset.saving
    form.removeAttribute('aria-busy')
  }
  let error = form.querySelector('[data-save-error]')
  if (!error) {
    error = document.createElement('div')
    error.dataset.saveError = 'yes'
    error.className = 'gk-flash gk-error'
    error.setAttribute('role', 'alert')
    error.tabIndex = -1
    form.prepend(error)
  }
  error.replaceChildren(document.createTextNode(`Save not confirmed: ${message} Your entries are still in this form. Some changes may already be saved. `))
  const check = document.createElement('a')
  check.href = location.href
  check.target = '_blank'
  check.rel = 'noopener'
  check.textContent = 'Check saved record in a new tab before retrying.'
  error.append(check)
  error.focus()
})

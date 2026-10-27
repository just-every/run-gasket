// With script available, keep ordinary navigation in this tab. Native posts keep their source draft open.
document.querySelectorAll('form[method=post][target=_blank]').forEach(form => form.removeAttribute('target'))
// Keep the draft in its live form. A receipt never contains submitted values.
document.addEventListener('submit', async event => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || form.method !== 'post' || !new URL(form.action).pathname.startsWith('/app/do/')) return
  event.preventDefault()
  if (form.dataset.saving) return
  const body = new FormData(form, event.submitter)
  const id = body.get('__gk_save')
  const receipt = typeof id === 'string' ? `/app/save-receipts/${encodeURIComponent(id)}` : null
  form.dataset.saving = 'yes'
  form.setAttribute('aria-busy', 'true')
  let message, retry = false, nextSaveId, signIn = false, feedbackShown = false
  try {
    const response = await fetch(form.action, { method: 'POST', body, headers: { accept: ['application', 'json'].join('/') } })
    if (response.status === 401 || (response.status === 403 && !response.headers.get('content-type')?.includes(['application', 'json'].join('/')))) {
      message = 'Your session or access ended. Nothing was saved by this request.'
      signIn = true; retry = true; nextSaveId = id
    } else {
    const result = await response.json()
    if (response.ok && result.saved === true) {
      const destination = new URL(result.destination, location.origin)
      if (destination.origin !== location.origin || !destination.pathname.startsWith('/app')) throw new Error('Invalid save destination')
      destination.searchParams.set('notice', result.notice || 'Saved.')
      location.assign(destination)
      return
    }
    message = typeof result.error === 'string' ? result.error : 'The server could not complete this save.'
    retry = result.retry === true; nextSaveId = result.nextSaveId
    }
  } catch {
    message = 'The connection ended before a save confirmation arrived.'
    showFeedback(message + (receipt ? ' Checking the save receipt.' : ' Check the saved record before retrying.'))
    if (receipt) {
      try {
        const response = await fetch(receipt, { headers: { accept: ['application', 'json'].join('/') }, signal: AbortSignal.timeout(10_000) })
        if (response.ok) message += ' ' + (await response.json()).message
        else message += ' No receipt is available yet. Check again before retrying.'
      } catch { message += ' The receipt could not be reached. Check it before retrying.' }
    }
  } finally {
    delete form.dataset.saving
    form.removeAttribute('aria-busy')
  }
  showFeedback(message, retry, nextSaveId, signIn)

  function showFeedback(message, retry = false, nextSaveId, signIn = false) {
    form.removeAttribute('aria-busy')
    if (retry && nextSaveId) form.elements.namedItem('__gk_save').value = nextSaveId
    else for (const button of form.querySelectorAll('button[type=submit],input[type=submit]')) button.disabled = true
    let error = form.querySelector('[data-save-error]')
    if (!error) {
      error = document.createElement('div')
      error.dataset.saveError = 'yes'
      error.className = 'gk-flash gk-error'
      error.setAttribute('role', 'alert')
      error.tabIndex = -1
      form.prepend(error)
    }
    error.replaceChildren(document.createTextNode(`${message} Your entries are still in this form. `))
    const check = document.createElement('a')
    check.href = signIn ? '/signin' : receipt || location.href
    check.target = '_blank'; check.rel = 'noopener'
    check.textContent = signIn ? 'Sign in in a new tab before retrying.' : 'Check save receipt in a new tab.'
    error.append(check)
    if (!feedbackShown) error.focus()
    feedbackShown = true
  }
})
// A server-rendered failed form uses the same keyboard focus as an enhanced form.
document.querySelector('#save-error')?.focus()

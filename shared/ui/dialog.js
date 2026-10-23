import { escapeHtml } from '../lib/html.js'

// In-page replacements for window.confirm / prompt / alert, built on the shared .admin-modal styles.
// Escape and the header close button resolve like Cancel (see the global handler in ui-theme.js).
let dialogCount = 0

function openDialog({ title, bodyHtml, actionsHtml, tag = 'div' }) {
  const id = `tcsms-dialog-${++dialogCount}`
  const returnFocus = document.activeElement
  const modal = document.createElement('div')
  modal.className = 'admin-modal stack-above'
  modal.innerHTML = `<${tag} class="admin-modal-box dialog-box" role="dialog" aria-modal="true" aria-labelledby="${id}-title"><div class="admin-modal-head"><h3 id="${id}-title">${escapeHtml(title)}</h3><button type="button" data-dialog-cancel aria-label="Close">×</button></div>${bodyHtml}<div class="admin-actions">${actionsHtml}</div></${tag}>`
  document.body.appendChild(modal)
  const close = () => { modal.remove(); if (returnFocus?.isConnected) returnFocus.focus() }
  return { modal, close }
}

const paragraphs = text => String(text || '').split('\n').filter(Boolean).map(line => `<p class="dialog-message">${escapeHtml(line)}</p>`).join('')

// danger: red confirm button and Cancel focused first, for deletes and other hard-to-undo actions.
export function confirmDialog(message, { title = 'Please confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, warning = '' } = {}) {
  return new Promise(resolve => {
    const { modal, close } = openDialog({
      title,
      bodyHtml: paragraphs(message) + (warning ? `<p class="dialog-warning" role="alert">${escapeHtml(warning)}</p>` : ''),
      actionsHtml: `<button type="button" class="admin-secondary" data-dialog-cancel>${escapeHtml(cancelText)}</button><button type="button" class="${danger ? 'admin-danger' : 'admin-primary'}" data-dialog-ok>${escapeHtml(confirmText)}</button>`
    })
    const finish = value => { close(); resolve(value) }
    modal.querySelectorAll('[data-dialog-cancel]').forEach(button => { button.onclick = () => finish(false) })
    modal.querySelector('[data-dialog-ok]').onclick = () => finish(true)
    modal.querySelector(danger ? '.admin-secondary[data-dialog-cancel]' : '[data-dialog-ok]').focus()
  })
}

// fields: [{ name, label, type, required, min, max, step, maxlength, multiline, placeholder, hint, value }]
// Resolves with { name: value } or null on cancel. The browser's own form validation blocks bad input inline.
export function formDialog({ title, message = '', fields, confirmText = 'Submit', danger = false }) {
  return new Promise(resolve => {
    const field = f => {
      const attrs = [f.required && 'required', f.min != null && `min="${f.min}"`, f.max != null && `max="${f.max}"`, f.step != null && `step="${f.step}"`, (f.maxlength ?? (f.multiline ? 500 : (!f.type || f.type === 'text') ? 120 : null)) && `maxlength="${f.maxlength ?? (f.multiline ? 500 : 120)}"`, f.placeholder && `placeholder="${escapeHtml(f.placeholder)}"`].filter(Boolean).join(' ')
      const control = f.options
        ? `<select name="${f.name}" ${attrs}>${f.options.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === String(f.value ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`
        : f.multiline
          ? `<textarea name="${f.name}" rows="3" ${attrs}>${escapeHtml(f.value ?? '')}</textarea>`
          : `<input name="${f.name}" type="${f.type || 'text'}" value="${escapeHtml(f.value ?? '')}" ${attrs}>`
      return `<label class="admin-full">${escapeHtml(f.label)}${control}${f.hint ? `<small class="dialog-hint">${escapeHtml(f.hint)}</small>` : ''}</label>`
    }
    const { modal, close } = openDialog({
      title,
      tag: 'form',
      bodyHtml: paragraphs(message) + `<div class="dialog-fields">${fields.map(field).join('')}</div>`,
      actionsHtml: `<button type="button" class="admin-secondary" data-dialog-cancel>Cancel</button><button type="submit" class="${danger ? 'admin-danger' : 'admin-primary'}">${escapeHtml(confirmText)}</button>`
    })
    const form = modal.querySelector('form')
    const finish = value => { close(); resolve(value) }
    modal.querySelectorAll('[data-dialog-cancel]').forEach(button => { button.onclick = () => finish(null) })
    form.onsubmit = event => {
      event.preventDefault()
      const values = Object.fromEntries(new FormData(form).entries())
      for (const f of fields) if (typeof values[f.name] === 'string' && f.type !== 'password') values[f.name] = values[f.name].trim()
      const bad = fields.find(f => f.required && !values[f.name])
      if (bad) return form.elements[bad.name].reportValidity()
      finish(values)
    }
    form.querySelector('input, textarea, select')?.focus()
  })
}

// For results that must not vanish like a toast (e.g. a one-time temporary password). copyText adds a Copy button.
export function noticeDialog(message, { title = 'Done', copyText = '', okText = 'OK' } = {}) {
  return new Promise(resolve => {
    const { modal, close } = openDialog({
      title,
      bodyHtml: paragraphs(message) + (copyText ? `<div class="dialog-copy"><code>${escapeHtml(copyText)}</code><button type="button" class="admin-secondary" data-dialog-copy>Copy</button></div>` : ''),
      actionsHtml: `<button type="button" class="admin-primary" data-dialog-ok>${escapeHtml(okText)}</button>`
    })
    const finish = () => { close(); resolve() }
    modal.querySelectorAll('[data-dialog-cancel], [data-dialog-ok]').forEach(button => { button.onclick = finish })
    const copy = modal.querySelector('[data-dialog-copy]')
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(copyText); copy.textContent = 'Copied' } catch { copy.textContent = 'Select and copy manually' }
    }
    modal.querySelector('[data-dialog-ok]').focus()
  })
}

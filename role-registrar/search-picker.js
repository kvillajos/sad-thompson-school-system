// Type-to-search dropdown on an existing <input>, styled by the shared .combo/.combo-list rules.
// Used instead of <datalist>, which shows no suggestions on iOS Safari and is inconsistent elsewhere.
// search(query) returns (or resolves to) the matching items; render(item) is the row HTML (escape it);
// text(item) is what the input shows once picked; onPick(item | null) runs on pick, and with null as soon
// as the text is edited again, so a stale pick is never submitted.
export function searchPicker(input, { search, render, text, onPick, minLength = 1, emptyText = 'No match' }) {
  const box = document.createElement('div')
  box.className = 'combo'
  box.style.width = '100%'
  input.replaceWith(box)
  box.append(input)
  const list = document.createElement('ul')
  list.className = 'combo-list hidden'
  list.setAttribute('role', 'listbox')
  box.append(list)
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-expanded', 'false')
  input.autocomplete = 'off'
  let items = []
  let active = -1
  let latest = 0
  const hide = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false') }
  const highlight = index => {
    active = index
    list.querySelectorAll('[data-index]').forEach(li => li.classList.toggle('active', Number(li.dataset.index) === index))
  }
  const pick = item => { input.value = text(item); hide(); onPick(item) }
  input.addEventListener('input', async () => {
    onPick(null)
    const query = input.value.trim()
    if (query.length < minLength) return hide()
    const request = ++latest
    const found = await search(query)
    if (request !== latest) return // a newer keystroke already answered
    items = found || []
    active = -1
    list.innerHTML = items.map((item, index) => `<li role="option" data-index="${index}">${render(item)}</li>`).join('') || `<li class="combo-empty">${emptyText}</li>`
    list.classList.remove('hidden')
    input.setAttribute('aria-expanded', 'true')
  })
  // mousedown, not click: it fires before the input's blur hides the list.
  list.addEventListener('mousedown', event => {
    const li = event.target.closest('[data-index]')
    if (!li) return
    event.preventDefault()
    pick(items[Number(li.dataset.index)])
  })
  input.addEventListener('keydown', event => {
    if (list.classList.contains('hidden') || !items.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      pick(items[active])
    } else if (event.key === 'Escape') hide()
  })
  input.addEventListener('blur', () => setTimeout(hide, 120))
  return { clear: () => { input.value = ''; hide(); onPick(null) } }
}

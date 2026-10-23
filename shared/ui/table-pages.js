// Shared table paging: any table with more than PAGE_SIZE data rows shows one page at a time
// with a Prev/Next bar. Rows are still rendered by each page's own code; this only hides the
// rows outside the current page, so it works with search, filters and the shared column sort.
// The pure helper stays free of DOM so scripts/check-table-pages.mjs can test it in Node.

export const PAGE_SIZE = 25

export function pageWindow(total, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  return { pages, page: current, start, end: Math.min(total, start + size) }
}

const known = new WeakMap() // tbody -> { rows: WeakSet of rows seen, page }
const isDataRow = row => row.cells.length > 1 && !row.querySelector('td[colspan]')

function apply(table, doc) {
  const body = table.tBodies[0]
  if (!body || table.closest('.transcript-print-card, [data-no-pages]')) return
  const rows = [...body.rows].filter(isDataRow)
  const holder = table.closest('.table-scroll') || table
  let pager = holder.nextElementSibling?.classList.contains('table-pager') ? holder.nextElementSibling : null
  let state = known.get(body)
  if (!state) known.set(body, state = { rows: new WeakSet(), page: 1 })
  // Rows we haven't seen mean new content (search/filter/reload): go back to page 1. A sort only reorders known rows.
  if (rows.some(row => !state.rows.has(row))) { state.page = 1; rows.forEach(row => state.rows.add(row)) }
  if (rows.length <= PAGE_SIZE) {
    rows.forEach(row => { if (row.hidden) row.hidden = false })
    pager?.remove()
    return
  }
  const view = pageWindow(rows.length, state.page)
  state.page = view.page
  rows.forEach((row, index) => { const hide = index < view.start || index >= view.end; if (row.hidden !== hide) row.hidden = hide })
  if (!pager) {
    pager = doc.createElement('div')
    pager.className = 'table-pager'
    holder.after(pager)
    pager.addEventListener('click', event => {
      const button = event.target.closest('[data-pg]')
      if (!button || button.disabled) return
      state.page += button.dataset.pg === 'next' ? 1 : -1
      apply(table, doc)
    })
  }
  const markup = `<span>Showing ${view.start + 1}&ndash;${view.end} of ${rows.length}</span><span class="pager-nav"><button type="button" class="pager-btn" data-pg="prev"${view.page === 1 ? ' disabled' : ''}>&lsaquo; Prev</button><span>Page ${view.page} of ${view.pages}</span><button type="button" class="pager-btn" data-pg="next"${view.page === view.pages ? ' disabled' : ''}>Next &rsaquo;</button></span>`
  if (pager.dataset.sig !== markup) { pager.dataset.sig = markup; pager.innerHTML = markup }
}

export function installTablePages(doc = document) {
  if (!doc || doc.__tcsmsPagesInstalled) return
  doc.__tcsmsPagesInstalled = true
  const run = tables => tables.forEach(table => apply(table, doc))
  const scope = doc.documentElement || doc.body
  if (typeof MutationObserver !== 'undefined' && scope) {
    new MutationObserver(records => {
      const changed = new Set()
      for (const record of records) {
        const target = record.target.parentElement || record.target
        if (target.closest?.('.table-pager')) continue
        const own = target.closest?.('table')
        if (own) changed.add(own)
        record.addedNodes.forEach(node => { if (node.nodeType === 1) { if (node.matches('table')) changed.add(node); node.querySelectorAll('table').forEach(table => changed.add(table)) } })
      }
      run([...changed])
    }).observe(scope, { childList: true, subtree: true })
  }
  run([...doc.querySelectorAll('table')])
}

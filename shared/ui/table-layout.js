// Page-level table layout, applied to every table as pages render them:
// - sticky headers: a header sticks under the top bar only when nothing between it and the page scrolls, so wrappers
//   that scroll sideways are switched to overflow:visible (.table-fits) while their table fits, and back when it doesn't;
// - sticky filter bars (.sticky-bar), whose height reaches the tables below them as --toolbar-h;
// - phone cards: on phones a table the page has not already laid out for phones (its rows still display as table rows)
//   becomes one card per row, each cell labelled with its column header;
// - loading rows ("Loading...") are marked so the theme draws placeholder bars instead of the text.
// Work is batched to one pass per frame and re-run when tables, their wrappers or filter bars change size.

const phone = window.matchMedia('(max-width: 700px)')
const BARS = '.admin-filterbar, .filterbar'
const observed = new WeakSet()
const scrolls = style => style.overflowX !== 'visible' || style.overflowY !== 'visible'

function boxesUpToMain(element) {
  const boxes = []
  for (let node = element.parentElement; node && node.tagName !== 'MAIN'; node = node.parentElement) boxes.push(node)
  return boxes
}

function fitWrappers(table) {
  const boxes = boxesUpToMain(table)
  // A box with a height limit scrolls on purpose (e.g. .table-scroll): the header sticks inside it instead.
  if (boxes.some(node => getComputedStyle(node).maxHeight !== 'none')) return table.classList.remove('sticky-page')
  const wrappers = boxes.filter(node => node.classList.contains('table-fits') || scrolls(getComputedStyle(node)))
  const fits = wrappers.every(node => node.scrollWidth <= node.clientWidth + 1)
  wrappers.forEach(node => node.classList.toggle('table-fits', fits))
  table.classList.toggle('sticky-page', fits)
}

function stickBar(bar) {
  const free = boxesUpToMain(bar).every(node => node.classList.contains('table-fits') || !scrolls(getComputedStyle(node)))
  bar.classList.toggle('sticky-bar', free)
  bar.parentElement.style.setProperty('--toolbar-h', free && bar.offsetHeight ? `${bar.offsetHeight}px` : '0px')
}

function labelCells(table) {
  const heads = [...(table.tHead?.rows[0]?.cells || [])].map(cell => cell.textContent.trim())
  for (const row of table.tBodies[0]?.rows || []) {
    if (row.cells.length === 1) continue
    for (const cell of row.cells) if (cell.dataset.label === undefined) cell.dataset.label = heads[cell.cellIndex] || ''
  }
}

function cardify(table) {
  if (table.classList.contains('table-cards')) return labelCells(table)
  if (!phone.matches || !table.tHead || table.closest('[data-no-cards]')) return
  // Decide once real rows are in, and leave alone any table whose rows the page already lays out for phones.
  const row = [...(table.tBodies[0]?.rows || [])].find(item => item.cells.length > 1)
  if (!row || getComputedStyle(table).display !== 'table' || getComputedStyle(row).display !== 'table-row') return
  table.classList.add('table-cards')
  labelCells(table)
}

function markLoading(table) {
  const rows = table.tBodies[0]?.rows
  if (!rows?.length) return
  const row = rows[0]
  row.classList.toggle('table-state-loading', rows.length === 1 && row.cells.length === 1 && /^loading\b/i.test(row.textContent.trim()))
}

let queued = false
const resize = new ResizeObserver(() => schedule())
const watch = element => {
  if (!element || observed.has(element)) return
  observed.add(element)
  resize.observe(element)
}

function run() {
  queued = false
  for (const table of document.querySelectorAll('table')) {
    markLoading(table)
    if (!table.closest('main') || table.closest('[data-no-sticky]')) continue
    watch(table)
    watch(table.parentElement)
    fitWrappers(table)
    cardify(table)
  }
  for (const bar of document.querySelectorAll(`main :is(${BARS})`)) {
    watch(bar)
    stickBar(bar)
  }
}

function schedule() {
  if (queued) return
  queued = true
  requestAnimationFrame(run)
}

export function installTableLayout() {
  if (window.__tcsmsTableLayoutInstalled) return
  window.__tcsmsTableLayoutInstalled = true
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  phone.addEventListener('change', schedule)
  schedule()
}

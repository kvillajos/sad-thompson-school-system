// Small dashboard charts. Every chart is one series in the chart colour (--chart-1), so none needs a legend; the
// card title says what is plotted. Bars and columns are HTML (their labels and values are real text, read in order
// by screen readers); the line chart is SVG with a crosshair tooltip and a visually hidden list of its values.
// Labels and values are set with textContent or escaped, never trusted as HTML.
import { escapeHtml } from '../lib/html.js'

const text = (tag, className, value) => Object.assign(document.createElement(tag), { className, textContent: value ?? '' })

// Stat tiles in one strip. A tile whose value is undefined shows a placeholder bar until it is filled in.
export function statStrip(host, tiles) {
  host.className = 'stat-strip'
  host.replaceChildren(
    ...tiles.map(tile => {
      const item = document.createElement('div')
      item.className = 'stat-tile'
      item.append(text('p', 'stat-label', tile.label), text('p', 'stat-value', tile.value), text('p', 'stat-note', tile.note))
      return item
    })
  )
}

const empty = (host, message) => host.replaceChildren(text('p', 'chart-empty', message))

// Vertical columns from one baseline, the value on each cap. rows: [{ label, value }]
export function columnChart(host, rows, { format = String, emptyText = 'No data yet.' } = {}) {
  if (!rows.some(row => row.value > 0)) return empty(host, emptyText)
  const max = Math.max(...rows.map(row => row.value))
  const list = document.createElement('ol')
  list.className = 'chart-columns'
  rows.forEach(row => {
    const item = document.createElement('li')
    const bar = text('span', 'chart-bar')
    bar.style.setProperty('--v', row.value / max)
    item.append(text('span', 'chart-value', format(row.value)), bar, text('span', 'chart-label', row.label))
    list.append(item)
  })
  host.replaceChildren(list)
}

// Horizontal bars, label on the left and the value at each bar's tip. rows: [{ label, value }]
export function barList(host, rows, { format = String, emptyText = 'No data yet.' } = {}) {
  if (!rows.some(row => row.value > 0)) return empty(host, emptyText)
  const max = Math.max(...rows.map(row => row.value))
  const list = document.createElement('ol')
  list.className = 'chart-bars'
  rows.forEach(row => {
    const item = document.createElement('li')
    const track = document.createElement('span')
    track.className = 'chart-track'
    const bar = text('span', 'chart-bar')
    bar.style.setProperty('--v', row.value / max)
    track.append(bar, text('span', 'chart-value', format(row.value)))
    item.append(text('span', 'chart-label', row.label), track)
    list.append(item)
  })
  host.replaceChildren(list)
}

// One dot per row on a shared min..max scale, with a reference line (e.g. the passing grade). rows: [{ label, value }]
export function dotPlot(host, rows, { min = 0, max = 100, mark = null, markLabel = '', format = String, emptyText = 'No data yet.' } = {}) {
  if (!rows.length) return empty(host, emptyText)
  const at = value => `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%`
  const list = document.createElement('ol')
  list.className = 'chart-dots'
  if (mark != null) list.style.setProperty('--mark', at(mark))
  rows.forEach(row => {
    const item = document.createElement('li')
    if (mark != null && row.value < mark) item.classList.add('below-mark')
    const track = document.createElement('span')
    track.className = 'chart-track'
    const dot = text('span', 'chart-dot')
    dot.style.left = at(row.value)
    track.append(dot)
    item.append(text('span', 'chart-label', row.label), track, text('span', 'chart-value', format(row.value)))
    list.append(item)
  })
  const axis = document.createElement('div')
  axis.className = 'chart-dots-axis'
  axis.append(text('span', '', format(min)), text('span', '', format(max)))
  if (mark != null) {
    const label = text('span', 'chart-mark-label', markLabel || format(mark))
    label.style.left = at(mark)
    axis.append(label)
  }
  host.replaceChildren(list, axis)
}

// A line over time with a 10% area wash, the latest value labelled at the end, and a crosshair tooltip that follows
// the pointer or the arrow keys. points: [{ label, value }] in time order.
export function lineChart(host, points, { min = 0, max = 100, ticks = [min, (min + max) / 2, max], format = String, label = '', emptyText = 'No data yet.' } = {}) {
  if (!points.length) return empty(host, emptyText)
  host.classList.add('chart-line')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `${label}. Latest ${points.at(-1).label}: ${format(points.at(-1).value)}.`)
  const tip = text('div', 'chart-tip')
  tip.hidden = true
  const values = document.createElement('ul')
  values.className = 'visually-hidden'
  points.forEach(point => values.append(text('li', '', `${point.label}: ${format(point.value)}`)))
  host.replaceChildren(svg, tip, values)

  const height = 200
  const pad = { left: 40, right: 52, top: 14, bottom: 28 }
  let x = () => 0
  const y = value => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom)
  let active = null

  const draw = () => {
    const width = Math.max(260, host.clientWidth)
    const span = width - pad.left - pad.right
    x = index => pad.left + (points.length === 1 ? span / 2 : (index / (points.length - 1)) * span)
    const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join('')
    const base = y(min).toFixed(1)
    const last = points.length - 1
    const xLabels = [...new Set([0, Math.floor(last / 2), last])]
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.setAttribute('width', width)
    svg.setAttribute('height', height)
    svg.innerHTML = `
      ${ticks.map(t => `<line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/><text class="chart-axis" x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end">${escapeHtml(format(t))}</text>`).join('')}
      ${xLabels.map(index => `<text class="chart-axis" x="${x(index)}" y="${height - 8}" text-anchor="${index === 0 && last ? 'start' : index === last && last ? 'end' : 'middle'}">${escapeHtml(points[index].label)}</text>`).join('')}
      <path class="chart-area" d="${line}L${x(last).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z"/>
      <path class="chart-path" d="${line}"/>
      <circle class="chart-end" cx="${x(last)}" cy="${y(points[last].value)}" r="4"/>
      <text class="chart-end-label" x="${x(last) + 10}" y="${y(points[last].value) + 4}">${escapeHtml(format(points[last].value))}</text>
      <line class="chart-cross" y1="${pad.top}" y2="${height - pad.bottom}" visibility="hidden"/>
      <circle class="chart-hover" r="4" visibility="hidden"/>`
    if (active != null) show(active)
  }
  const show = index => {
    active = index
    const point = points[index]
    const cross = svg.querySelector('.chart-cross')
    const dot = svg.querySelector('.chart-hover')
    cross.setAttribute('x1', x(index))
    cross.setAttribute('x2', x(index))
    dot.setAttribute('cx', x(index))
    dot.setAttribute('cy', y(point.value))
    cross.setAttribute('visibility', 'visible')
    dot.setAttribute('visibility', 'visible')
    tip.replaceChildren(text('strong', '', format(point.value)), text('span', '', point.label))
    tip.hidden = false
    const left = Math.min(Math.max(x(index) - tip.offsetWidth / 2, 0), host.clientWidth - tip.offsetWidth)
    tip.style.transform = `translate(${left}px, ${Math.max(0, y(point.value) - tip.offsetHeight - 12)}px)`
  }
  const hide = () => {
    active = null
    tip.hidden = true
    svg.querySelectorAll('.chart-cross, .chart-hover').forEach(item => item.setAttribute('visibility', 'hidden'))
  }
  const nearest = clientX => {
    const box = svg.getBoundingClientRect()
    const px = ((clientX - box.left) / box.width) * Number(svg.getAttribute('width'))
    let best = 0
    points.forEach((_, index) => {
      if (Math.abs(x(index) - px) < Math.abs(x(best) - px)) best = index
    })
    return best
  }
  svg.addEventListener('pointermove', event => show(nearest(event.clientX)))
  svg.addEventListener('pointerleave', hide)
  svg.addEventListener('focus', () => show(points.length - 1))
  svg.addEventListener('blur', hide)
  svg.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (!step) return
    event.preventDefault()
    show(Math.min(points.length - 1, Math.max(0, (active ?? points.length - 1) + step)))
  })
  draw()
  new ResizeObserver(() => host.clientWidth && draw()).observe(host)
}

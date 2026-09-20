// Sidebar active-item "notch" check.
// Renders the real sharedTheme plus the real mountSidebar() markup in headless Edge and
// verifies the two radial-gradient flares that round the active row into the sidebar.
// The original bug: the row panel ::after (inset:0 0 0 62px, z-index:-1) leaked into the
// active row, so the bottom flare stayed inside the row and was covered by the next row.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const js = readFileSync(join(root, 'ui-theme.js'), 'utf8')
const theme = js.match(/const sharedTheme = `([\s\S]*?)`;/)[1]
const sidebar = js.slice(js.indexOf('export function mountSidebar'), js.indexOf('export function mountProfile'))

assert.ok(theme.includes('.app-sidebar .sidebar-link:not(.active)::after'), 'row panel ::after must be scoped to non-active links')
assert.ok(theme.includes('--sidebar-rail:62px;'), 'the icon rail token must exist')
const declaredRadius = theme.match(/--sidebar-radius:\s*(\d+)px/)[1] + 'px'
assert.ok(theme.includes('inset:0 0 0 var(--sidebar-rail);'), 'the row panel must start at the rail token')
assert.ok(theme.includes('linear-gradient(to right,transparent 0 var(--sidebar-rail),var(--sidebar-surface) var(--sidebar-rail) 100%)'), 'the active band must start at the rail token')
assert.ok(theme.includes('width:var(--sidebar-rail);'), 'the icon cell must be as wide as the rail token')
assert.ok(!/\.app-sidebar \.sidebar-link::after\s*\{/.test(theme), 'row panel ::after must not target the active link')
assert.ok(theme.includes('.app-sidebar .sidebar-link:not(.active)::after { left:56px; }'), 'mobile ::after override must be scoped to non-active links')
assert.ok(theme.includes('.app-sidebar .sidebar-link:not(.active)::before { width:46px; height:38px; }'), 'mobile ::before override must be scoped to non-active links')
assert.ok(theme.includes('top:calc(var(--sidebar-radius) * -1);'), 'top flare must sit one radius above the active row')
assert.ok(theme.includes('bottom:calc(var(--sidebar-radius) * -1);'), 'bottom flare must sit one radius below the active row')
assert.match(theme, /\.app-sidebar \.sidebar-link\.active \{[^}]*z-index:2/, 'active row must paint above its siblings so the flares are not covered')

const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const folder = mkdtempSync(join(tmpdir(), 'sidebar-notch-'))
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${theme}
  /* Collapse the brand so the rows start at y=0 and the geometry is predictable. */
  html,body { margin:0 }
  .app-sidebar { padding-top:0 }
  .app-sidebar .sidebar-brand { min-height:0; height:0; padding:0; overflow:hidden }
  .app-sidebar .sidebar-logo { display:none }
  .app-sidebar .sidebar-nav { margin-top:0 }
  .app-sidebar .sidebar-link { min-height:40px }
</style></head><body>
<pre id="result"></pre>
<script>
${sidebar.replace('export function mountSidebar', 'function mountSidebar')}
mountSidebar([
  { label: 'Dashboard', href: '/admin-dashboard.html', icon: '⌂' },
  { label: 'Manage Accounts', href: '/admin-accounts.html', active: true, icon: '▣' },
  { label: 'Manage Faculty', href: '/admin-faculty.html', icon: '♙' }
], 'Administrative<br>Control')
const links = [...document.querySelectorAll('.sidebar-link')]
const active = links.find(link => link.classList.contains('active'))
const plain = links.find(link => !link.classList.contains('active'))
const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
const pseudo = (el, part) => { const s = getComputedStyle(el, part); return { position: s.position, top: s.top, right: s.right, bottom: s.bottom, width: s.width, height: s.height, zIndex: s.zIndex, background: s.backgroundImage, colour: s.backgroundColor, content: s.content } }
const sidebarEl = document.querySelector('.app-sidebar')
const brandEl = document.querySelector('.sidebar-brand')
const iconEl = document.querySelector('.sidebar-icon')
const tokens = el => ({ rail: getComputedStyle(el).getPropertyValue('--sidebar-rail').trim(), radius: getComputedStyle(el).getPropertyValue('--sidebar-radius').trim(), surface: getComputedStyle(el).getPropertyValue('--sidebar-surface').trim() })
document.getElementById('result').textContent = JSON.stringify({
  sidebarClass: document.querySelector('.app-sidebar').className,
  bodyClass: document.body.className,
  mobileQuery: matchMedia('(max-width:700px)').matches,
  active: rect(active),
  first: rect(links[0]),
  sidebar: rect(document.querySelector('.app-sidebar')),
  activeZ: getComputedStyle(active).zIndex,
  activePosition: getComputedStyle(active).position,
  activePanel: getComputedStyle(active).backgroundImage,
  before: pseudo(active, '::before'),
  after: pseudo(active, '::after'),
  plainPanel: pseudo(plain, '::after'),
  plainZ: getComputedStyle(plain).zIndex,
  tokens: tokens(sidebarEl),
  sidebarBg: getComputedStyle(sidebarEl).backgroundImage,
  brandRadius: getComputedStyle(brandEl).borderBottomRightRadius,
  iconWidth: getComputedStyle(iconEl).width,
  iconCell: getComputedStyle(active).gridTemplateColumns.split(' ')[0]
})
</script></body>`

function render(name, size) {
  const file = join(folder, `${name}.html`)
  writeFileSync(file, fixture)
  const args = ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${join(folder, `profile-${name}`)}`]
  if (size) args.push(`--window-size=${size}`)
  args.push('--virtual-time-budget=3000', '--dump-dom', pathToFileURL(file).href)
  const result = spawnSync(edge, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 4e6 })
  if (result.error) throw result.error
  const match = result.stdout.match(/<pre id="result">(.*?)<\/pre>/)
  assert.ok(match?.[1], `${name}: browser produced no result: ${result.stderr.slice(-1500)}`)
  return JSON.parse(match[1].replaceAll('&quot;', '"'))
}
try {
  // Desktop layout: the flares must hug the sidebar's right edge.
  const desktop = render('desktop')
  console.log(desktop)
  assert.equal(desktop.sidebarClass, 'app-sidebar')
  assert.ok(desktop.bodyClass.includes('has-app-sidebar'))
  assert.equal(desktop.mobileQuery, false, 'desktop fixture must use the wide layout')
  assert.equal(desktop.activePosition, 'relative', 'active row must stay positioned')
  assert.equal(desktop.activeZ, '2', 'active row must be raised above the other rows')
  assert.equal(desktop.active.right, desktop.sidebar.right, 'active row must reach the sidebar edge')
  assert.ok(desktop.active.top > desktop.first.top, 'rows must be stacked in one column')
  const radius = desktop.tokens.radius
  assert.equal(radius, declaredRadius, 'the rendered radius token must match the stylesheet')
  assert.equal(desktop.tokens.rail, '62px')
  // The light band must line up with the dark icon rail: token == icon cell == gradient stop.
  assert.equal(desktop.iconWidth, desktop.tokens.rail, 'icon cell must be as wide as the rail token')
  assert.equal(desktop.iconCell, desktop.tokens.rail, 'the active row grid must start where the light band starts')
  assert.ok(desktop.sidebarBg.includes('62px'), `the dark rail must end at the same stop as the light band, got ${desktop.sidebarBg}`)
  assert.ok(desktop.activePanel.includes('62px'), `the active band must start at the same rail stop, got ${desktop.activePanel}`)
  assert.equal(desktop.brandRadius, radius, 'the brand corner must curve with the same radius as the flood')
  for (const flare of [desktop.before, desktop.after]) {
    assert.equal(flare.content, '""', 'flares must be generated content')
    assert.equal(flare.position, 'absolute')
    assert.equal(flare.right, '0px', 'flares must hug the sidebar edge')
    assert.equal(flare.width, radius)
    assert.equal(flare.height, radius)
    assert.equal(flare.zIndex, '0', 'flares must paint above the row panel')
    assert.ok(flare.background.startsWith('radial-gradient(circle at 0px'), `flare must be a radial gradient, got ${flare.background}`)
    assert.ok(flare.background.includes('rgba(0, 0, 0, 0)'), `flare must be transparent inside the radius, got ${flare.background}`)
    assert.ok(flare.background.includes('rgb('), `flare must use a solid colour stop, got ${flare.background}`)
  }
  assert.equal(desktop.before.top, `-${radius}`, 'top flare sits one radius above the active row')
  assert.equal(desktop.after.bottom, `-${radius}`, 'bottom flare sits one radius below the active row')
  assert.equal(Number.parseFloat(desktop.after.top), desktop.active.height, 'bottom flare starts at the row bottom edge')
  assert.equal(Number.parseFloat(desktop.before.bottom), desktop.active.height, 'top flare ends at the row top edge')
  assert.ok(desktop.before.background.startsWith('radial-gradient(circle at 0px 0px'), 'top flare must be anchored at the row top-right corner')
  assert.ok(desktop.after.background.startsWith('radial-gradient(circle at 0px 100%'), 'bottom flare must be anchored at the row bottom-right corner')
  assert.ok(desktop.activePanel.includes('62px'), 'active row surface must be painted from the rail edge onward')
  // The non-active row keeps its own solid panel fill and must not be raised.
  assert.ok(desktop.plainPanel.background === 'none' || desktop.plainPanel.colour !== '', 'non-active rows keep a separate panel fill')
  assert.equal(desktop.plainZ, 'auto', 'non-active rows must not be raised')
  console.log('sidebar notch checks passed (desktop)')
  // The <=700px block sits above the desktop .app-sidebar rules in sharedTheme, so the
  // desktop widths are never overridden; those mobile overrides are asserted as CSS text
  // above (see the static asserts) instead of being rendered here.
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
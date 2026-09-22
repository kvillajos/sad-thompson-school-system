// Local browser smoke test using actual registrar markup/styles/confirmation handler.
// No credentials and no live database writes. Windows Edge is already installed.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '..')
const html = readFileSync(join(root, 'student-records.html'), 'utf8')
const registrarModules = ['registrar.js', 'registrar-admissions.js', 'registrar-sectioning.js', 'registrar-academic.js', 'registrar-shifting.js']
const js = registrarModules.map(name => readFileSync(join(root, name), 'utf8')).join('\n')
const entryJs = readFileSync(join(root, 'registrar.js'), 'utf8')
const sectioningJs = readFileSync(join(root, 'registrar-sectioning.js'), 'utf8')
const admissionsJs = readFileSync(join(root, 'registrar-admissions.js'), 'utf8')
const theme = readFileSync(join(root, 'ui-theme.js'), 'utf8').match(/const sharedTheme = `([\s\S]*?)`;/)[1]
const handler = sectioningJs.slice(sectioningJs.indexOf('let removeEnrollmentCountdown'), sectioningJs.indexOf('async function removeEnrollment('))
const landing = entryJs.slice(entryJs.indexOf('mountSidebar(['), entryJs.indexOf('async function init('))
assert.ok(!js.includes('loadDashboard'))
assert.ok(!html.includes('id="dashboard"'))
// Every id the registrar modules read must exist in the page or in a JS-rendered template.
const domSources = html + [...js.matchAll(/\.innerHTML\s*=\s*(['"`])([\s\S]*?)\1/g)].map(m => m[2]).join('')
const missing = [...new Set([...js.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]))].filter(id => !domSources.includes(`id="${id}"`))
assert.deepEqual(missing, [], `registrar modules reference missing element ids: ${missing.join(', ')}`)
const folder = mkdtempSync(join(tmpdir(), 'registrar-ui-'))
try {
  const fixture = html.replace(/<script[\s\S]*?<\/script>/g, '').replace('</head>', `<style>${theme}</style></head>`).replace('</body>', `<button id="test-remove">Remove</button><pre id="result"></pre><script>
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value);
  const toast = () => {};
  const withBusy = async (button, label, action) => action();
  const gradeLevelOptions = () => '';
  function mountSidebar(items) {
    const nav = document.createElement('nav');
    nav.innerHTML = items.map(i => '<button data-tab="'+i.tab+'" class="'+(i.active?'active':'')+'">'+i.label+'</button>').join('');
    document.body.prepend(nav);
  }
  ${landing}
  const visiblePanels = () => [...document.querySelectorAll('[data-panel]')].filter(p => getComputedStyle(p).display !== 'none').map(p => p.id);
  const landingPanels = visiblePanels();
  $('new-enrollment').click();
  const admissionPanels = visiblePanels();
  document.querySelector('[data-tab="enrollment"]').click();
  const returnPanels = visiblePanels();
  let writes = 0;
  async function removeEnrollment() { writes++; }
  ${handler}
  const snapshot = () => { const b = $('confirm-remove-enrollment'), s = getComputedStyle(b), r = b.getBoundingClientRect(); return {disabled:b.disabled, display:s.display, visibility:s.visibility, opacity:s.opacity, color:s.color, background:s.backgroundColor, width:r.width, height:r.height}; };
  $('test-remove').onclick = () => confirmRemoveEnrollment('1', {students:{first_name:'Test',last_name:'Student'}});
  $('test-remove').click();
  const initial = snapshot();
  $('confirm-remove-enrollment').click();
  const earlyWrites = writes;
  setTimeout(() => { const after = snapshot(); $('confirm-remove-enrollment').click(); $('result').textContent = JSON.stringify({initial,after,earlyWrites,writes,landingPanels,admissionPanels,returnPanels}); }, 3500);
  </script></body>`)
  const file = join(folder, 'fixture.html')
  writeFileSync(file, fixture)
  const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const result = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${join(folder, 'profile')}`, '--virtual-time-budget=4500', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 4e6 })
  if (result.error) throw result.error
  const match = result.stdout.match(/<pre id="result">(.*?)<\/pre>/)
  assert.ok(match?.[1], `Browser produced no result: ${result.stderr.slice(-1500)}`)
  const data = JSON.parse(match[1].replaceAll('&quot;', '"'))
  console.log(data)
  assert.deepEqual(data.landingPanels, ['enrollment'])
  assert.deepEqual(data.admissionPanels, ['admission'])
  assert.deepEqual(data.returnPanels, ['enrollment'])
  for (const s of [data.initial, data.after]) {
    assert.notEqual(s.display, 'none'); assert.notEqual(s.visibility, 'hidden')
    assert.ok(s.width > 0 && s.height > 0); assert.ok(Number(s.opacity) > 0)
  }
  assert.equal(data.initial.background, 'rgb(185, 28, 28)', 'confirmation must have a visible red background')
  assert.equal(data.earlyWrites, 0)
  assert.equal(data.after.disabled, false)
  assert.equal(data.writes, 1)
  console.log('registrar browser checks passed (remove modal + landing)')
  // Item 6: full Review -> edit -> save -> close flow against a mocked Supabase.
  const reviewStart = admissionsJs.indexOf('// Opens the application with a database-held edit lock')
  const reviewEnd = admissionsJs.indexOf('})', admissionsJs.indexOf("'Saving…', saveReviewEdits)")) + 3
  const reviewSlice = admissionsJs.slice(reviewStart, reviewEnd)
  const folder2 = mkdtempSync(join(tmpdir(), 'review-flow-'))
  const fixture2 = html.replace(/<script[\s\S]*?<\/script>/g, '').replace('</head>', `<style>${theme}</style></head>`).replace('</body>', `<pre id="result"></pre><script>
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '');
  const toast = () => {};
  const withBusy = async (button, label, action) => action();
  const state = { selectedApplication: null };
  const loadApplications = async () => {};
  const calls = [];
  const appRow = { id: 7, first_name: 'Ana', last_name: 'Santos', birth_date: '2012-05-01', sex: 'Female', grade_level: 'Grade 5', address: '123 Elm', guardian_name: 'Maria Santos', guardian_relationship: 'Mother', guardian_phone: '09171112222', guardian_email: 'm@example.com', prior_school: 'XYZ ES', prior_grade: 'Grade 4', special_program: '', remarks: 'check docs', status: 'under_review', editing_by: 'registrar1', editing_since: '2026-09-17T01:00:00Z', editing_token: 'tok-123' };
  const supabase = { rpc: async (name, params) => { calls.push({ name, params }); if (name === 'begin_application_edit') return { data: appRow, error: null }; return { data: { released: true }, error: null } }, from: () => ({}) };
  ${reviewSlice}
  ;(async () => {
    await openReview('7');
    const duringEdit = { modalOpen: !$('review-modal').classList.contains('hidden'), prefilled: $('review-content').querySelector('[name=first_name]').value, status: $('review-content').querySelector('[name=status]').value };
    $('close-review').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    const released = calls.some(call => call.name === 'end_application_edit' && call.params.p_token === 'tok-123');
    await openReview('7');
    $('review-content').querySelector('[name=last_name]').value = 'Santos-Cruz';
    $('review-form').requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 30));
    const save = calls.find(call => call.name === 'save_application_edit');
    $('result').textContent = JSON.stringify({ duringEdit, released, modalClosed: $('review-modal').classList.contains('hidden'), savedToken: save?.params.p_token, savedName: save?.params.p_payload?.last_name, savedId: save?.params.p_application_id });
  })();
  </script></body>`)
  const file2 = join(folder2, 'fixture.html')
  writeFileSync(file2, fixture2)
  const result2 = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${join(folder2, 'profile')}`, '--virtual-time-budget=3000', '--dump-dom', pathToFileURL(file2).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 4e6 })
  if (result2.error) throw result2.error
  const match2 = result2.stdout.match(/<pre id="result">(.*?)<\/pre>/)
  assert.ok(match2?.[1], `Review fixture produced no result: ${result2.stderr.slice(-1500)}`)
  const review = JSON.parse(match2[1].replaceAll('&quot;', '"'))
  console.log(review)
  assert.equal(review.duringEdit.modalOpen, true, 'review modal must open')
  assert.equal(review.duringEdit.prefilled, 'Ana', 'submitted info must be shown')
  assert.equal(review.duringEdit.status, 'under_review')
  assert.equal(review.released, true, 'closing must release the edit lock')
  assert.equal(review.savedId, 7)
  assert.equal(review.savedToken, 'tok-123')
  assert.equal(review.savedName, 'Santos-Cruz', 'edits must reach save_application_edit')
  assert.equal(review.modalClosed, true)
  console.log('review flow checks passed')
} finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }

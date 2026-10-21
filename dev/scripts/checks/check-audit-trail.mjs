import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const sql = readFileSync(join(root, 'dev', 'database', 'backupsqlmigration.sql'), 'utf8')
const auditPage = readFileSync(join(root, 'role-admin', 'admin-audit-page.js'), 'utf8')
const auditHtml = readFileSync(join(root, 'role-admin', 'admin-audit.html'), 'utf8')
const uiTheme = readFileSync(join(root, 'shared', 'ui', 'ui-theme.js'), 'utf8')
const mobileCss = readFileSync(join(root, 'public', 'css', 'responsive-mobile.css'), 'utf8')
for (const action of [
  'REGISTRAR_EDIT',
  'UPDATE_STATUS',
  'SAVE_FACULTY_GRADES',
  'SAVE_ATTENDANCE',
  'UPDATE_STUDENT_PROFILE',
  'LOCK_ACADEMIC_RECORD',
  'BATCH_PROMOTION_RESULT',
  'UPDATE_OWN_PROFILE'
])
  assert.match(sql, new RegExp(action), `${action} must be auditable`)
assert.match(sql, /create trigger promotion_log_audit/i)
assert.doesNotMatch(
  sql,
  /create policy[^;]+on audit_logs[^;]+for (insert|update|delete)/is,
  'audit_logs must remain append-only to clients'
)
assert.match(
  auditPage,
  /const auditRow = row =>.*data-label="When".*data-label="Action".*data-label="Entity".*data-label="Details"/s,
  'live and archived audit rows must retain labels for mobile cards'
)
assert.ok(
  auditPage.includes('class="audit-details-desktop">${escape(JSON.stringify(row.details || {}))}'),
  'desktop audit details must remain compact'
)
assert.ok(
  auditPage.includes('class="audit-details-mobile">${escape(detailText(row.details))}'),
  'mobile audit details must use readable field/value lines'
)
assert.match(auditPage, /\(data \|\| \[\]\)\.map\(auditRow\)/, 'live audit table must use the shared row renderer')
assert.match(auditPage, /\(rows \|\| \[\]\)\.map\(auditRow\)/, 'archive audit table must use the shared row renderer')
assert.match(auditHtml, /<table class="audit-events-table">/, 'live audit table must use desktop column sizing')
assert.match(auditPage, /<table class="audit-events-table">/, 'archive audit table must use desktop column sizing')
assert.match(
  uiTheme,
  /\.audit-events-table th:nth-child\(4\), \.audit-events-table td:nth-child\(4\) \{ width:46%; \}/,
  'desktop Details column must have room to render'
)
assert.match(
  mobileCss,
  /body\.admin-shell \.audit-details-desktop\s*\{\s*display:\s*none;/,
  'mobile cards should hide compact desktop details'
)
assert.match(mobileCss, /body\.admin-shell \.audit-details-mobile\s*\{\s*display:\s*block;/, 'mobile cards should show readable details')
console.log('audit trail static checks passed')

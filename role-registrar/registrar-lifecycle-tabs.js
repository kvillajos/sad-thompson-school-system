// The school-year lifecycle tabs (Bulk Import, ...). Each is built the first time it is opened; registrar.js
// only calls showLifecycleTab() from its tab switcher.
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { mountImportTab } from './registrar-import.js'
import { mountStaffSanctions } from '../shared/ui/sanctions.js'
import { mountSectionReportsTab } from './registrar-section-reports.js'
import { mountDepedForms } from './registrar-deped-forms.js'
import { mountRegistrarDocumentRequests } from '../shared/ui/document-requests.js'
import { mountGraduationTab } from './registrar-graduation.js'

const TABS = {
  graduation: mountGraduationTab,
  documents: mountRegistrarDocumentRequests,
  import: mountImportTab,
  // Mount the reports first: it draws #deped-forms-host, so look it up only afterwards.
  'section-reports': async host => {
    const reports = await mountSectionReportsTab(host)
    mountDepedForms(host.querySelector('#deped-forms-host'), reports)
  },
  discipline: host => mountStaffSanctions(host)
}
const mounted = new Set()

export function showLifecycleTab(name) {
  const mount = TABS[name]
  const host = document.getElementById(`${name}-host`)
  if (!mount || !host || mounted.has(name)) return
  mounted.add(name)
  Promise.resolve(mount(host)).catch(error => {
    mounted.delete(name)
    toast(describeError(error, 'Open tab'), 'error')
  })
}

import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { mountStaffSanctions } from '../shared/ui/sanctions.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('discipline')
await mountStaffSanctions(document.getElementById('discipline-host')).catch(error =>
  toast(describeError(error, 'Load discipline records'), 'error')
)
hideLoadingScreen()

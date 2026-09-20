import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const git = (command) => {
  try { return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return '' }
}
const branch = git('git rev-parse --abbrev-ref HEAD')
const commit = git('git rev-parse --short HEAD')
const buildLabel = branch && commit ? `${branch}@${commit}` : 'local build'

export default defineConfig({
  // Shown on the login screen so a branch/build can be identified at a glance.
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version} · ${buildLabel}`) },
  build: { rollupOptions: { input: { index:'index.html', admin:'admin-dashboard.html', adminAccounts:'admin-accounts.html', adminFaculty:'admin-faculty.html', adminSections:'admin-sections.html', adminSubjects:'admin-subjects.html', adminSchedules:'admin-schedules.html', adminCurriculum:'admin-curriculum.html', adminAudit:'admin-audit.html', registrar:'student-records.html', faculty:'faculty/faculty-dashboard.html', facultyClassList:'faculty/faculty-class-list.html', facultyGrades:'faculty/faculty-grades.html', facultyUpload:'faculty/faculty-upload.html', facultyAttendance:'faculty/faculty-attendance.html', facultyReports:'faculty/faculty-reports.html', student:'student-dashboard.html' } } }
})

import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

const git = (command) => {
  try { return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return '' }
}
const branch = process.env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD')
const builtAt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const buildLabel = branch ? `${branch} · ${builtAt}` : builtAt

export default defineConfig({
  // Shown on the login screen so a branch/build can be identified at a glance.
  define: { __APP_VERSION__: JSON.stringify(buildLabel) },
  build: { rollupOptions: { input: { index:'index.html', admin:'admin-dashboard.html', adminAccounts:'admin-accounts.html', adminFaculty:'admin-faculty.html', adminSections:'admin-sections.html', adminSubjects:'admin-subjects.html', adminSchedules:'admin-schedules.html', adminCurriculum:'admin-curriculum.html', adminAudit:'admin-audit.html', registrar:'student-records.html', faculty:'faculty/faculty-dashboard.html', facultyClassList:'faculty/faculty-class-list.html', facultyGrades:'faculty/faculty-grades.html', facultyUpload:'faculty/faculty-upload.html', facultyAttendance:'faculty/faculty-attendance.html', facultyReports:'faculty/faculty-reports.html', student:'student-dashboard.html' } } }
})

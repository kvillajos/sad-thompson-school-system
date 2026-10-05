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
  build: { rollupOptions: { input: { index:'index.html', admin:'role-admin/admin-dashboard.html', adminAccounts:'role-admin/admin-accounts.html', adminFaculty:'role-admin/admin-faculty.html', adminSections:'role-admin/admin-sections.html', adminSubjects:'role-admin/admin-subjects.html', adminSchedules:'role-admin/admin-schedules.html', adminAudit:'role-admin/admin-audit.html', registrar:'role-registrar/student-records.html', faculty:'role-faculty/faculty-dashboard.html', facultyClassList:'role-faculty/faculty-class-list.html', facultyGrades:'role-faculty/faculty-grades.html', facultyUpload:'role-faculty/faculty-upload.html', facultyAttendance:'role-faculty/faculty-attendance.html', facultyReports:'role-faculty/faculty-reports.html', student:'role-student/student-dashboard.html', forgotPassword: 'forgot-password.html',
verifyResetCode: 'verify-reset-code.html',
resetPassword: 'reset-password.html' } } }
})

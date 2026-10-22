import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

const git = command => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// Commit messages start "<work-branch>/<target> - ..." (e.g. "TuesdayFixes/main - ..."); use that work-branch name so a push to main still shows it.
const prefix = (process.env.VERCEL_GIT_COMMIT_MESSAGE || git('git log -1 --format=%s')).match(/^([\w.&-]+)\/[\w.-]+ - /)?.[1]
const branch = prefix || process.env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD')
const builtAt = new Date().toLocaleString('en-US', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})
const buildLabel = branch ? `${branch} · ${builtAt}` : builtAt

// Every HTML page is a build entry. Add new pages here.
const pages = {
  // Login + password reset (root URLs are stable: Supabase email links point at them)
  index: 'index.html',
  forgotPassword: 'forgot-password.html',
  verifyResetCode: 'verify-reset-code.html',
  resetPassword: 'reset-password.html',

  // Administrator
  admin: 'role-admin/admin-dashboard.html',
  adminAccounts: 'role-admin/admin-accounts.html',
  adminFaculty: 'role-admin/admin-faculty.html',
  adminSections: 'role-admin/admin-sections.html',
  adminSubjects: 'role-admin/admin-subjects.html',
  adminSchedules: 'role-admin/admin-schedules.html',
  adminAudit: 'role-admin/admin-audit.html',

  // Registrar
  registrar: 'role-registrar/student-records.html',

  // Faculty
  faculty: 'role-faculty/faculty-dashboard.html',
  facultyClassList: 'role-faculty/faculty-class-list.html',
  facultyGrades: 'role-faculty/faculty-grades.html',
  facultyUpload: 'role-faculty/faculty-upload.html',
  facultyAttendance: 'role-faculty/faculty-attendance.html',
  facultyReports: 'role-faculty/faculty-reports.html',
  facultyFeedback: 'role-faculty/faculty-feedback.html',

  // Student
  student: 'role-student/student-dashboard.html'
}

export default defineConfig({
  // Shown on the login screen so a branch/build can be identified at a glance.
  define: { __APP_VERSION__: JSON.stringify(buildLabel) },
  build: { rollupOptions: { input: pages } }
})

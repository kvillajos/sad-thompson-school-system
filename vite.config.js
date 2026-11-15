import { defineConfig } from 'vite'

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
  adminYearSetup: 'role-admin/admin-year-setup.html',
  adminGradeTracker: 'role-admin/admin-grade-tracker.html',
  adminAdmissions: 'role-admin/admin-admissions.html',
  adminDiscipline: 'role-admin/admin-discipline.html',
  adminReports: 'role-admin/admin-reports.html',

  // Registrar
  registrar: 'role-registrar/student-records.html',

  // Faculty
  faculty: 'role-faculty/faculty-dashboard.html',
  facultyAdvisory: 'role-faculty/faculty-advisory.html',
  facultyClassList: 'role-faculty/faculty-class-list.html',
  facultyGrades: 'role-faculty/faculty-grades.html',
  facultyAttendance: 'role-faculty/faculty-attendance.html',
  facultyReports: 'role-faculty/faculty-reports.html',
  facultyFeedback: 'role-faculty/faculty-feedback.html',

  // Student
  student: 'role-student/student-dashboard.html'
}

export default defineConfig({
  build: { rollupOptions: { input: pages } }
})

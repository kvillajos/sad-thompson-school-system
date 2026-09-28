import { defineConfig } from 'vite'

export default defineConfig({
  build: { rollupOptions: { input: { index:'index.html', admin:'admin-dashboard.html', adminAccounts:'admin-accounts.html', adminFaculty:'admin-faculty.html', adminSections:'admin-sections.html', adminSubjects:'admin-subjects.html', adminSchedules:'admin-schedules.html', adminAudit:'admin-audit.html', registrar:'student-records.html', faculty:'faculty/faculty-dashboard.html', facultyClassList:'faculty/faculty-class-list.html', facultyGrades:'faculty/faculty-grades.html', facultyUpload:'faculty/faculty-upload.html', facultyAttendance:'faculty/faculty-attendance.html', facultyReports:'faculty/faculty-reports.html', student:'student-dashboard.html' } } }
})

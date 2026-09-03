import { defineConfig } from 'vite'
export default defineConfig({ build: { rollupOptions: { input: { index:'index.html', admin:'admin-dashboard.html', adminSections:'admin-sections.html', registrar:'student-records.html', faculty:'faculty-dashboard.html', student:'student-dashboard.html' } } } })

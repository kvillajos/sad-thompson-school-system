import { currentSchoolYear } from '../lib/grades.js';
import { exportTableToCsv } from './table-copy.js';

/**
 * Mounts a shared filter bar (School Year, Grade Level, Section, and Export CSV) above a table.
 * 
 * @param {Object} options
 * @param {HTMLElement} options.container - The parent element where the filter bar will render.
 * @param {Array<Object>} options.rows - The original full list of data rows.
 * @param {Array<string>} options.filters - List of filter keys needed for this page: 'schoolYear', 'gradeLevel', 'section'.
 * @param {Function} options.onFilter - Callback function receiving (filteredRows) when a dropdown changes.
 * @param {string} [options.filename='export.csv'] - Default filename for CSV export.
 * @param {Object} [options.fieldMappings] - Optional custom getters for fields, e.g. { schoolYear: r => r.year }.
 */
export function mountFilterBar({
  container,
  rows = [],
  filters = ['schoolYear', 'gradeLevel', 'section'],
  onFilter,
  filename = 'export.csv',
  fieldMappings = {}
}) {
  if (!container) return;

  const getFieldValue = (row, key) => {
    if (fieldMappings[key]) return fieldMappings[key](row);
    if (key === 'schoolYear') return row.school_year || row.academic_year || row.year || '';
    if (key === 'gradeLevel') return row.grade_level || row.grade || '';
    if (key === 'section') return row.section_name || row.section || '';
    return row[key] || '';
  };

  const activeSY = currentSchoolYear();

  // Build unique options from current rows
  const getUniqueOptions = (key) => {
    const set = new Set();
    rows.forEach(r => {
      const val = getFieldValue(r, key);
      if (val) set.add(String(val));
    });
    return Array.from(set).sort();
  };

  const syOptions = getUniqueOptions('schoolYear');
  const gradeOptions = getUniqueOptions('gradeLevel');
  const sectionOptions = getUniqueOptions('section');

  // Render filter bar UI
  container.innerHTML = `
    <div class="filter-bar d-flex flex-wrap align-items-center gap-2 mb-3 p-2 bg-light rounded border">
      ${filters.includes('schoolYear') ? `
        <div class="filter-group d-flex align-items-center gap-1">
          <label class="form-label mb-0 small text-muted">School Year:</label>
          <select id="filter-sy" class="form-select form-select-sm" style="width: auto;">
            <option value="${activeSY}">Active school year (${activeSY})</option>
            <option value="ALL">All years</option>
            ${syOptions.filter(sy => sy !== activeSY).map(sy => `<option value="${sy}">${sy}</option>`).join('')}
          </select>
        </div>
      ` : ''}

      ${filters.includes('gradeLevel') ? `
        <div class="filter-group d-flex align-items-center gap-1">
          <label class="form-label mb-0 small text-muted">Grade:</label>
          <select id="filter-grade" class="form-select form-select-sm" style="width: auto;">
            <option value="ALL">All Grades</option>
            ${gradeOptions.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
      ` : ''}

      ${filters.includes('section') ? `
        <div class="filter-group d-flex align-items-center gap-1">
          <label class="form-label mb-0 small text-muted">Section:</label>
          <select id="filter-section" class="form-select form-select-sm" style="width: auto;">
            <option value="ALL">All Sections</option>
            ${sectionOptions.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      ` : ''}

      <div class="ms-auto">
        <button id="filter-export-csv" class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1">
          <i class="bi bi-download"></i> Export CSV
        </button>
      </div>
    </div>
  `;

  // Filter application logic
  let currentFilteredRows = [...rows];

  const applyFilters = () => {
    const syVal = container.querySelector('#filter-sy')?.value;
    const gradeVal = container.querySelector('#filter-grade')?.value;
    const sectionVal = container.querySelector('#filter-section')?.value;

    currentFilteredRows = rows.filter(row => {
      if (filters.includes('schoolYear') && syVal && syVal !== 'ALL') {
        const val = String(getFieldValue(row, 'schoolYear'));
        if (val && val !== syVal) return false;
      }
      if (filters.includes('gradeLevel') && gradeVal && gradeVal !== 'ALL') {
        const val = String(getFieldValue(row, 'gradeLevel'));
        if (val && val !== gradeVal) return false;
      }
      if (filters.includes('section') && sectionVal && sectionVal !== 'ALL') {
        const val = String(getFieldValue(row, 'section'));
        if (val && val !== sectionVal) return false;
      }
      return true;
    });

    if (typeof onFilter === 'function') {
      onFilter(currentFilteredRows);
    }
  };

  // Event Listeners
  ['#filter-sy', '#filter-grade', '#filter-section'].forEach(selector => {
    const el = container.querySelector(selector);
    if (el) el.addEventListener('change', applyFilters);
  });

  const exportBtn = container.querySelector('#filter-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportTableToCsv(currentFilteredRows, filename);
    });
  }

  // Initial trigger to filter by default active school year
  applyFilters();
}
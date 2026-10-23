import { generateSchedulePlan } from '../shared/lib/schedule-plan.js';

/**
 * Mounts the Auto-Assign Schedule button and modal preview on the Admin Schedules page.
 * 
 * @param {Object} options
 * @param {HTMLElement} options.container - Container element to render the action button.
 * @param {Function} options.getSchedulingContext - Function returning { section, subjects, existingSchedules, settings }
 * @param {Function} options.onApply - Callback function receiving the array of newly generated schedule objects to save.
 */
export function mountAutoSchedule({
  container,
  getSchedulingContext,
  onApply
}) {
  if (!container) return;

  container.innerHTML = `
    <button id="btn-auto-schedule" class="btn btn-outline-primary btn-sm d-flex align-items-center gap-1">
      <i class="bi bi-magic"></i> Auto-Assign Schedule
    </button>
  `;

  const button = container.querySelector('#btn-auto-schedule');

  button.addEventListener('click', async () => {
    const context = typeof getSchedulingContext === 'function' ? await getSchedulingContext() : null;

    if (!context || !context.section) {
      alert('Please select a section first before auto-assigning schedules.');
      return;
    }

    const { assigned, unplaced } = generateSchedulePlan({
      section: context.section,
      subjects: context.subjects || [],
      existingSchedules: context.existingSchedules || [],
      settings: context.settings || {}
    });

    if (assigned.length === 0 && unplaced.length === 0) {
      alert('No subjects available to schedule for this section.');
      return;
    }

    let message = `Auto-Assign Preview for ${context.section.name}:\n\n`;
    message += `Successfully planned ${assigned.length} class slot(s).\n`;

    if (unplaced.length > 0) {
      message += `\nWarning: ${unplaced.length} subject(s) could not be placed:\n`;
      unplaced.forEach(u => {
        message += `- ${u.subject.name}: ${u.reason}\n`;
      });
    }

    message += `\nWould you like to apply these generated schedules?`;

    if (confirm(message)) {
      if (typeof onApply === 'function') {
        onApply(assigned);
      }
    }
  });
}
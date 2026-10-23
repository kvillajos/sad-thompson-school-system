/**
 * Pure schedule planner that assigns time slots for subjects in a section
 * without Supabase calls or side effects.
 * 
 * @param {Object} params
 * @param {Object} params.section - Target section object ({ id, name, grade_level })
 * @param {Array<Object>} params.subjects - Subjects for this grade level with assigned teachers [{ id, name, teacher_id }]
 * @param {Array<Object>} params.existingSchedules - All current schedules across the system
 * @param {Object} params.settings - School settings including lunch/break times ({ lunch_start, lunch_end, break_start, break_end, time_slots })
 * @returns {Object} { assigned: Array<Object>, unplaced: Array<Object> }
 */
export function generateSchedulePlan({
  section,
  subjects = [],
  existingSchedules = [],
  settings = {}
}) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const defaultSlots = settings.time_slots || [
    { start: '07:30', end: '08:30' },
    { start: '08:30', end: '09:30' },
    { start: '09:30', end: '10:30' },
    { start: '10:30', end: '11:30' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' }
  ];

  const lunchStart = settings.lunch_start || '11:30';
  const lunchEnd = settings.lunch_end || '13:00';
  const breakStart = settings.break_start || '';
  const breakEnd = settings.break_end || '';

  const assigned = [];
  const unplaced = [];

  const isOverlapping = (slotStart, slotEnd, blockStart, blockEnd) => {
    if (!blockStart || !blockEnd) return false;
    return slotStart < blockEnd && slotEnd > blockStart;
  };

  for (const subject of subjects) {
    let allocated = false;

    for (const day of days) {
      if (allocated) break;

      for (const slot of defaultSlots) {
        // 1. Check Lunch or Break overlap
        if (isOverlapping(slot.start, slot.end, lunchStart, lunchEnd)) continue;
        if (breakStart && breakEnd && isOverlapping(slot.start, slot.end, breakStart, breakEnd)) continue;

        // 2. Check Section double-booking
        const sectionConflict = existingSchedules.some(s => 
          s.section_id === section.id &&
          s.day === day &&
          isOverlapping(slot.start, slot.end, s.start_time, s.end_time)
        ) || assigned.some(a =>
          a.day === day &&
          isOverlapping(slot.start, slot.end, a.start_time, a.end_time)
        );

        if (sectionConflict) continue;

        // 3. Check Teacher double-booking
        if (subject.teacher_id) {
          const teacherConflict = existingSchedules.some(s =>
            s.teacher_id === subject.teacher_id &&
            s.day === day &&
            isOverlapping(slot.start, slot.end, s.start_time, s.end_time)
          ) || assigned.some(a =>
            a.teacher_id === subject.teacher_id &&
            a.day === day &&
            isOverlapping(slot.start, slot.end, a.start_time, a.end_time)
          );

          if (teacherConflict) continue;
        }

        // 4. Slot fits!
        assigned.push({
          section_id: section.id,
          subject_id: subject.id,
          subject_name: subject.name,
          teacher_id: subject.teacher_id || null,
          room: section.room || 'TBD',
          day,
          start_time: slot.start,
          end_time: slot.end
        });

        allocated = true;
        break;
      }
    }

    if (!allocated) {
      unplaced.push({
        subject,
        reason: 'No available slot without section, teacher, or break/lunch conflict.'
      });
    }
  }

  return { assigned, unplaced };
}
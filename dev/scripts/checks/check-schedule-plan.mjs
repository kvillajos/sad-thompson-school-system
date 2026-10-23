import assert from 'node:assert/strict';
import { generateSchedulePlan } from '../../../shared/lib/schedule-plan.js';

console.log('Running check-schedule-plan.mjs...');

// Test 1: Teacher Conflict Detection
{
  const section = { id: 'sec-1', name: 'Grade 7 - Red', room: 'Room 101' };
  const subjects = [{ id: 'sub-1', name: 'Math', teacher_id: 'teach-1' }];
  const existingSchedules = [
    { section_id: 'sec-2', teacher_id: 'teach-1', day: 'Monday', start_time: '07:30', end_time: '08:30' }
  ];

  const result = generateSchedulePlan({ section, subjects, existingSchedules });
  const mondayEarly = result.assigned.find(a => a.day === 'Monday' && a.start_time === '07:30');
  assert.equal(mondayEarly, undefined, 'Teacher conflict slot should be skipped');
}

// Test 2: Lunch & Break Overlap Avoidance
{
  const section = { id: 'sec-1', name: 'Grade 7 - Red', room: 'Room 101' };
  const subjects = [{ id: 'sub-1', name: 'Science', teacher_id: 'teach-2' }];
  const settings = { lunch_start: '11:30', lunch_end: '13:00' };

  const result = generateSchedulePlan({ section, subjects, settings });
  const lunchSlot = result.assigned.find(a => a.start_time >= '11:30' && a.end_time <= '13:00');
  assert.equal(lunchSlot, undefined, 'Class should not be scheduled during lunch');
}

console.log('check-schedule-plan.mjs passed!');
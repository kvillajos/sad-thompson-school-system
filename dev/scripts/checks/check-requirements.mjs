// Admission requirements: which items apply to an applicant and which are still missing.
import assert from 'node:assert/strict'
import { admissionType, requirementStatus, requirementsFor } from '../../../shared/lib/requirements.js'

const types = [
  { code: 'birth_certificate', label: 'PSA birth certificate', sort_order: 1 },
  { code: 'report_card', label: 'Form 138 (report card)', sort_order: 2 },
  { code: 'good_moral', label: 'Good moral certificate', sort_order: 3 },
  { code: 'form_137', label: 'Form 137 / SF10', transferee_only: true, sort_order: 4 },
  { code: 'jhs_completion', label: 'JHS completion certificate', grade_levels: [11, 12], sort_order: 5 },
  { code: 'baptismal', label: 'Baptismal certificate', required: false, sort_order: 6 },
  { code: 'old', label: 'Retired item', is_active: false, sort_order: 7 }
]

assert.equal(admissionType({ grade_level: '7' }), 'new')
assert.equal(admissionType({ grade_level: 'Grade 11' }), 'new')
assert.equal(admissionType({ grade_level: '9' }), 'transferee')
assert.equal(admissionType({ grade_level: '7', admission_type: 'transferee' }), 'transferee')

const codes = app => requirementsFor(app, types).map(t => t.code)
assert.deepEqual(codes({ grade_level: '7' }), ['birth_certificate', 'report_card', 'good_moral', 'baptismal'])
assert.deepEqual(codes({ grade_level: '9' }), ['birth_certificate', 'report_card', 'good_moral', 'form_137', 'baptismal'])
assert.deepEqual(codes({ grade_level: '11' }), ['birth_certificate', 'report_card', 'good_moral', 'jhs_completion', 'baptismal'])
assert.deepEqual(codes({ grade_level: '12' }), [
  'birth_certificate',
  'report_card',
  'good_moral',
  'form_137',
  'jhs_completion',
  'baptismal'
])

// Optional items never block; received ones (marked or uploaded) count.
const status = requirementStatus({ grade_level: '9' }, types, new Set(['birth_certificate', 'form_137']))
assert.deepEqual(status.missing, ['Form 138 (report card)', 'Good moral certificate'])
assert.equal(status.done, 2)
assert.equal(status.total, 4)
assert.equal(status.complete, false)
assert.equal(requirementStatus({ grade_level: '7' }, types, new Set(['birth_certificate', 'report_card', 'good_moral'])).complete, true)

console.log('requirements checks passed')

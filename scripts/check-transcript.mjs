import assert from 'node:assert/strict'
import { buildTranscript } from '../transcript.js'

const rows = [{ school_year: '2026-2027', subject: 'Math', grade: 90, remarks: 'Good', first_sem_q1: 88, first_sem_q2: 92 }]
const official = buildTranscript({ student: { first_name: 'Ana', last_name: 'Santos', lrn_number: 'TCS-1', grade_level: 5 }, rows })
assert.match(official, /OFFICIAL TRANSCRIPT OF RECORDS/)
assert.match(official, /Registrar/)
assert.match(official, /1st Semester/)
const unofficial = buildTranscript({ student: { first_name: 'Ana', last_name: 'Santos' }, rows, mode: 'unofficial' })
assert.match(unofficial, /UNOFFICIAL TRANSCRIPT - STUDENT COPY/)
assert.match(unofficial, /Verify this record/)
assert.doesNotMatch(unofficial, />Registrar</)
console.log('transcript checks passed')

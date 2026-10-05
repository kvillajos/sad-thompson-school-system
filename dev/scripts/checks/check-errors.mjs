import assert from 'node:assert/strict'
import { describeError } from '../../../shared/lib/errors.js'

assert.match(describeError({ code: 'PGRST205', message: 'schema cache' }, 'Load'), /migration is missing/)
assert.match(describeError({ code: '42501', message: 'row-level security policy' }, 'Save'), /permission/)
assert.match(describeError({ message: 'duplicate key value violates unique constraint' }, 'Save'), /already exists/)
assert.match(describeError({ message: 'Target section is full' }, 'Shift'), /section is full/)
assert.match(describeError({ message: 'Registrar Ana has this file in an edit session' }, 'Review'), /edit session/, 'an edit lock is not mistaken for an expired login')
assert.match(describeError({ message: 'JWT expired' }, 'Load'), /session has expired/)
assert.match(describeError(new TypeError('Failed to fetch'), 'Load'), /network is unavailable/)
assert.match(describeError({ code: '23514', message: 'new row violates check constraint "grade_range"' }, 'Save'), /check the entered values/)
assert.match(describeError({ message: 'Reason must be at least 10 characters' }, 'Send'), /Reason must be at least 10 characters/, 'readable server rules are shown as-is')
console.log('error handling checks passed')

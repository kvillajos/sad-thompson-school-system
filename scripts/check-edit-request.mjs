// Runnable check for the edit-request helpers: npm run check:edit-request
import assert from 'node:assert/strict'
import { changedFields, staleFields } from '../edit-request.js'

const current = { first_name: 'Sam', middle_name: null, address: '27 Roxas Ave.', contact_number: '0917' }
assert.deepEqual(changedFields(current, { first_name: 'Sam', middle_name: '', address: '27 Roxas Ave.', contact_number: '0917' }), {}, 'untouched boxes (even null vs empty) change nothing')
assert.deepEqual(changedFields(current, { first_name: ' Sam ', address: '5 New St.' }), { address: '5 New St.' }, 'whitespace ignored, only real changes sent')
assert.deepEqual(changedFields(current, { middle_name: 'Cruz' }), { middle_name: 'Cruz' }, 'null -> value counts as a change')
assert.deepEqual(changedFields(current, { contact_number: '' }), { contact_number: '' }, 'clearing a value is a change')
assert.deepEqual(changedFields(null, {}), {})

assert.deepEqual(staleFields({ address: '27 Roxas Ave.' }, { address: '27 Roxas Ave.' }), [], 'unchanged since the request')
assert.deepEqual(staleFields({ address: '27 Roxas Ave.', contact_number: null }, { address: '9 Other St.', contact_number: '' }), ['address'], 'null and blank match; a different address is stale')
assert.deepEqual(staleFields(undefined, { address: 'x' }), [], 'old requests without a "before" never warn')
console.log('edit request checks passed')

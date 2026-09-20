import assert from 'node:assert/strict'
import { describeError } from '../errors.js'

assert.match(describeError({ code: 'PGRST205', message: 'schema cache' }, 'Load'), /migration is missing/)
assert.match(describeError({ code: '42501', message: 'row-level security policy' }, 'Save'), /permission/)
assert.match(describeError({ message: 'duplicate key value violates unique constraint' }, 'Save'), /already exists/)
assert.match(describeError({ message: 'Target section is full' }, 'Shift'), /section is full/)
console.log('error handling checks passed')

// Runnable check for fetchAll (reads past Supabase's 1,000-row page): npm run check:fetch-all
import assert from 'node:assert/strict'
import { fetchAll } from '../fetch-all.js'

const table = Array.from({ length: 2350 }, (_, id) => ({ id }))
const calls = []
const build = () => ({ range: async (from, to) => { calls.push([from, to]); return { data: table.slice(from, to + 1), error: null } } })
const { data, error } = await fetchAll(build)
assert.equal(error, null)
assert.equal(data.length, 2350, 'every row is returned, not just the first 1,000')
assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]], 'three pages, the last one short')

const exact = await fetchAll(() => ({ range: async (from) => ({ data: from === 0 ? table.slice(0, 1000) : [], error: null }) }))
assert.equal(exact.data.length, 1000, 'an exact multiple of the page size still ends')

const failing = await fetchAll(() => ({ range: async () => ({ data: null, error: { message: 'boom' } }) }))
assert.equal(failing.error.message, 'boom', 'an error is passed through, not swallowed')
assert.equal(failing.data, null)
console.log('fetchAll checks passed')

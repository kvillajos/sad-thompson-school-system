// Runnable check for the shared table pager's pure helper: npm run check:pages
import assert from 'node:assert/strict'
import { pageWindow, PAGE_SIZE } from '../table-pages.js'

assert.deepEqual(pageWindow(10, 1), { pages: 1, page: 1, start: 0, end: 10 })
assert.deepEqual(pageWindow(49, 1), { pages: 2, page: 1, start: 0, end: PAGE_SIZE })
assert.deepEqual(pageWindow(49, 2), { pages: 2, page: 2, start: PAGE_SIZE, end: 49 })
assert.equal(pageWindow(49, 9).page, 2, 'page is clamped to the last page')
assert.equal(pageWindow(49, 0).page, 1, 'page is clamped to the first page')
assert.deepEqual(pageWindow(0, 1), { pages: 1, page: 1, start: 0, end: 0 })
console.log('table pager checks passed')

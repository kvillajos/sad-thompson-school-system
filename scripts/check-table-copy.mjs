// Runnable check for the table-copy clipboard helpers: npm run check:copy
import assert from 'node:assert/strict'
import { cleanText, toTsv, toHtml, isTextNumber } from '../table-copy.js'

assert.equal(cleanText('  Adam \n  Min\u00a0 '), 'Adam Min')
assert.equal(toTsv([['LRN', 'Name'], ['012345678901', 'Ana "A" Cruz']]), 'LRN\tName\n012345678901\t"Ana ""A"" Cruz"')
assert.equal(toTsv([['a\tb', 'c\nd']]), '"a\tb"\t"c\nd"', 'tabs and newlines inside a cell are quoted')
assert.ok(isTextNumber('012345678901') && isTextNumber('0123') && !isTextNumber('95') && !isTextNumber('12.5'))
assert.match(toHtml([['012345678901', 'A & B']]), /<td style="mso-number-format:'\@'">012345678901<\/td><td>A &amp; B<\/td>/)
console.log('table copy checks passed')

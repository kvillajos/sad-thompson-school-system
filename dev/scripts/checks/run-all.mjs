// `npm run check` - runs every check-*.mjs in this folder and exits non-zero if any fails.
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const dir = import.meta.dirname
const failed = []
for (const file of readdirSync(dir)
  .filter(name => /^check-.*\.mjs$/.test(name))
  .sort()) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [`${dir}/${file}`], { encoding: 'utf8' })
  console.log(`${status === 0 ? 'PASS' : 'FAIL'}  ${file}`)
  if (status !== 0) (failed.push(file), console.log((stdout + stderr).trim().split('\n').slice(-8).join('\n')))
}
console.log(failed.length ? `\n${failed.length} check(s) failed: ${failed.join(', ')}` : '\nAll checks passed')
process.exit(failed.length ? 1 : 0)

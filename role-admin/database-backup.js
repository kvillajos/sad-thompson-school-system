// Reports & Audit > Audit Trail > Database Backup: one button that downloads the whole database as a zip of .sql files
// plus a README. The server writes the SQL (v70 backup_table_sql, admin only, password fields blanked); this page only
// pages through it, zips it and logs the download.
// AGENTS.md: NEVER click, script or call this in a test or a demo. It copies real student data out of the system.
import { supabase } from '../shared/lib/auth-client.js'
import { confirmPassword, withBusy } from '../shared/ui/shell.js'
import { downloadFile } from '../shared/ui/download.js'
import { noticeDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import {
  PAGE_ROWS,
  PART_LIMIT,
  clearTablesSql,
  dataFileName,
  dataFileSql,
  manifestTxt,
  readmeTxt,
  restoreAllSql,
  sequencesSql,
  uploadedFilesTxt
} from '../shared/lib/backup-files.js'

export function mountDatabaseBackup(host, admin) {
  host.innerHTML = `
    <div class="admin-section-title">
      <h3>Database Backup</h3>
      <button id="download-backup" class="admin-primary" type="button">Download backup</button>
    </div>
    <p class="audit-export-note">
      Downloads every record (students, grades, attendance, sections, accounts and history) as a zip of .sql files,
      with a README that explains how to restore it. Passwords and uploaded files are not included. It takes a minute
      or two: download it when nobody is entering data, and keep the file somewhere safe, as it contains personal data.
    </p>`
  const button = host.querySelector('#download-backup')
  button.onclick = () => downloadBackup(button, admin)
}

async function downloadBackup(button, admin) {
  const ok = await confirmPassword(
    admin.email,
    'Enter your password to download a backup of the whole database. The file contains personal data: keep it somewhere safe.'
  )
  if (!ok) return
  await withBusy(button, 'Preparing…', async () => {
    try {
      const { data: catalog, error } = await supabase.rpc('backup_catalog')
      if (error) throw error
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const totalRows = catalog.tables.reduce((sum, table) => sum + Number(table.rows), 0) || 1
      const dataFiles = []
      let doneRows = 0

      for (const [index, table] of catalog.tables.entries()) {
        let part = 1
        let buffer = ''
        const flush = () => {
          if (!buffer) return
          const name = dataFileName(index + 1, table.name, part)
          zip.file(name, dataFileSql(table.name, part, buffer))
          dataFiles.push(name)
          part += 1
          buffer = ''
        }
        // Page until the server returns nothing, so rows added after the count are not cut off.
        for (let offset = 0; ; offset += PAGE_ROWS) {
          const { data: sql, error: pageError } = await supabase.rpc('backup_table_sql', {
            p_table: table.name,
            p_offset: offset,
            p_limit: PAGE_ROWS
          })
          if (pageError) throw pageError
          if (!sql) break
          if (buffer.length + sql.length > PART_LIMIT) flush() // start a new file before this one would pass the limit
          buffer += `${sql}\n`
          const rowsHere = Math.min(PAGE_ROWS, Math.max(Number(table.rows) - offset, 0))
          doneRows += rowsHere
          button.textContent = `Backing up ${table.name}… ${Math.min(99, Math.floor((doneRows / totalRows) * 100))}%`
        }
        flush()
      }

      const takenAt = new Date(catalog.generated_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })
      const adminName = admin.username || admin.email
      const source = location.host
      zip.file('README.txt', readmeTxt({ takenAt, adminName, source }))
      zip.file('manifest.txt', manifestTxt({ catalog, dataFiles, adminName, source }))
      zip.file('1-clear-tables.sql', clearTablesSql(catalog.tables.map(table => table.name)))
      zip.file('3-finish-sequences.sql', sequencesSql(catalog.sequences))
      zip.file('restore-all.sql', restoreAllSql(dataFiles))
      zip.file('uploaded-files.txt', uploadedFilesTxt(catalog.files))

      button.textContent = 'Compressing…'
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      // Local time (Philippines), not UTC, so the name matches the clock on the wall: tcsms-backup-20261114-0940.zip
      const at = new Date(catalog.generated_at)
      const two = n => String(n).padStart(2, '0')
      const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`
      const fileName = `tcsms-backup-${stamp}.zip`
      downloadFile(fileName, blob)
      button.textContent = 'Downloaded'

      const { error: logError } = await supabase.rpc('log_backup_download', {
        p_details: { file: fileName, tables: catalog.tables.length, rows: totalRows, data_files: dataFiles.length, bytes: blob.size }
      })
      if (logError) toast(describeError(logError, 'Record the backup in the audit trail'), 'error')
      await noticeDialog(
        `${fileName} has been downloaded (${(blob.size / 1024 / 1024).toFixed(1)} MB, ${totalRows.toLocaleString()} rows). ` +
          'Open README.txt inside it for how to restore. Move it to safe, school-approved storage and delete it from this computer.',
        { title: 'Backup downloaded' }
      )
    } catch (error) {
      toast(describeError(error, 'Download backup'), 'error')
    }
  })
}

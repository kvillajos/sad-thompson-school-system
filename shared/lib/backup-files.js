// Text files inside the admin "Download backup" zip (pure: no DOM, no network; dev/scripts/checks/check-backup-files.mjs).
// AGENTS.md: the download itself is never run in a test or a demo; checking these text builders is fine.

export const PAGE_ROWS = 1000 // rows per backup_table_sql call
export const PART_LIMIT = 2_000_000 // characters per data file: small enough to paste into the Supabase SQL editor

const pad = (n, width = 3) => String(n).padStart(width, '0')
const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`

export const dataFileName = (index, table, part) => `2-data/${pad(index)}-${table}-${pad(part, 2)}.sql`

// One data file: its INSERT statements in a transaction with triggers and foreign-key checks off (replica mode), so the
// files can run in any order and the audit trail is not flooded with restore noise.
export const dataFileSql = (table, part, statements) =>
  `-- TCSMS backup: table ${table}, part ${part}\n` +
  `-- Rows that already exist (same primary key) are skipped, so running a file twice is harmless.\n` +
  `begin;\nset local session_replication_role = replica;\n\n${statements}\ncommit;\n`

export const clearTablesSql = tables =>
  `-- TCSMS backup: EMPTIES every table listed below so the backup can be loaded in their place.\n` +
  `-- Run this ONLY when you mean to replace the current data with this backup (see README.txt).\n` +
  `-- Logins, uploaded files and the database structure are not touched.\n` +
  `begin;\ntruncate table\n  ${tables.map(table => `public.${quoteIdent(table)}`).join(',\n  ')}\nrestart identity cascade;\ncommit;\n`

// Puts every ID counter back where it was, so new records continue after the restored ones.
export const sequencesSql = sequences =>
  `-- TCSMS backup: ID counters. Run this LAST.\n` +
  sequences
    .map(seq =>
      seq.last_value == null
        ? `select setval('public.${quoteIdent(seq.name)}', ${Number(seq.start)}, false);`
        : `select setval('public.${quoteIdent(seq.name)}', ${Number(seq.last_value)}, true);`
    )
    .join('\n') +
  '\n'

// psql runs the files in order from one command (\ir = relative to this file).
export const restoreAllSql = dataFiles =>
  [
    '-- TCSMS backup: runs every file in order with psql. Read README.txt first: step 1 EMPTIES the tables.',
    '\\set ON_ERROR_STOP on',
    '\\ir 1-clear-tables.sql',
    ...dataFiles.map(file => `\\ir ${file}`),
    '\\ir 3-finish-sequences.sql',
    ''
  ].join('\n')

export function manifestTxt({ catalog, dataFiles, adminName, source }) {
  const width = Math.max(...catalog.tables.map(table => table.name.length), 5)
  const totalRows = catalog.tables.reduce((sum, table) => sum + Number(table.rows), 0)
  return [
    'TCSMS database backup - contents',
    '',
    `Taken:      ${catalog.generated_at}`,
    `Taken by:   ${adminName}`,
    `Source:     ${source}`,
    `Postgres:   ${catalog.postgres}`,
    `Tables:     ${catalog.tables.length}   Rows: ${totalRows}   ID counters: ${catalog.sequences.length}   Data files: ${dataFiles.length}`,
    `Uploaded files listed (not included): ${catalog.files.length}`,
    '',
    'Rows per table at the moment the backup started (compare after a restore):',
    ...catalog.tables.map(table => `  ${table.name.padEnd(width)}  ${String(table.rows).padStart(9)}`),
    ''
  ].join('\n')
}

export const uploadedFilesTxt = files =>
  [
    'Uploaded files (profile pictures, admission documents, proof files) at backup time.',
    'These files are NOT inside this backup. Download them from Supabase > Storage if you need copies.',
    '',
    'bucket / path   (size in bytes, uploaded at)',
    ...files.map(file => `${file.bucket} / ${file.name}   (${file.size ?? '?'}, ${file.created_at})`),
    ''
  ].join('\n')

export const readmeTxt = ({ takenAt, adminName, source }) => `TCSMS DATABASE BACKUP
=====================
Taken ${takenAt} by ${adminName}, from ${source}.

KEEP THIS FILE SAFE
-------------------
This backup holds personal data: student records, grades, attendance, guardians and staff details.
It is covered by the Data Privacy Act of 2012 (RA 10173). Store it only on school-approved storage
(for example an encrypted drive or the school's private cloud folder), never on a personal device or in
a chat or email. Delete old copies you no longer need.

WHAT IS INSIDE
--------------
  README.txt               this guide
  manifest.txt             when it was taken, and the number of rows in every table (use it to check a restore)
  1-clear-tables.sql       EMPTIES the tables, for replacing the current data with this backup
  2-data/*.sql             the data: one or more files per table, in order
  3-finish-sequences.sql   sets the ID counters so new records continue after the restored ones
  restore-all.sql          runs all of the above in order with psql (one command)
  uploaded-files.txt       list of uploaded files at backup time (the files themselves are not included)

WHAT IS NOT INSIDE
------------------
  * Passwords and logins. Password fields are blanked on purpose. Existing logins keep working when you
    restore into the same Supabase project. In a NEW project, every account needs a new password: the
    administrator opens Manage Accounts and uses "Reset Password" on each account (it creates the login).
  * Uploaded files (pictures and documents): see uploaded-files.txt.
  * The database structure (tables, functions, security rules). It lives in the project's code repository;
    the project lead sets it up. This backup only fills an existing structure with data.

BEFORE YOU RESTORE
------------------
  1. Restoring REPLACES today's data with the data in this backup. Anything entered after the backup was
     taken is lost. Make sure that is what the school wants, and tell everyone to stop using the system.
  2. Take a fresh backup first (Reports & Audit > Audit Trail > Download backup), so you can go back.
  3. Get the database connection string from Supabase: Project Settings > Database > Connection string
     (URI). It contains the database password: do not share it.
  4. Unzip this backup into its own folder.

HOW TO RESTORE
--------------
Option A - psql (recommended, one command). Install the PostgreSQL client tools, open a terminal in the
unzipped folder and run:

    psql "<connection string>" -f restore-all.sql

It stops at the first error and tells you which file failed.

Option B - Supabase CLI, from the unzipped folder (PowerShell):

    $db = "<connection string>"
    supabase db query --db-url $db -f 1-clear-tables.sql
    Get-ChildItem 2-data\\*.sql | Sort-Object Name | ForEach-Object { supabase db query --db-url $db -f $_.FullName }
    supabase db query --db-url $db -f 3-finish-sequences.sql

Option C - Supabase SQL editor (small backups only). Open each file, paste it into the SQL editor and press
Run, in this order: 1-clear-tables.sql, then every file in 2-data in name order, then
3-finish-sequences.sql. Large tables (attendance) are split into many files, so A or B is much faster.

Only want to ADD missing rows back (not replace everything)? Skip 1-clear-tables.sql. Rows that already
exist are left unchanged, and only missing ones are inserted.

AFTER THE RESTORE
-----------------
  1. Compare the row counts with manifest.txt. In the SQL editor:
       select relname as table_name, n_live_tup as approx_rows from pg_stat_user_tables
       where schemaname = 'public' order by relname;
     (approximate; for an exact number use: select count(*) from public.<table>;)
  2. Sign in as an administrator and open a few students, sections and grades to check them.
  3. In a new project only: reset passwords from Manage Accounts (see WHAT IS NOT INSIDE).

PROBLEMS
--------
  * "relation ... does not exist" or "column ... does not exist": the database structure is older or newer
    than the backup. Ask the project lead to bring the structure up to date first.
  * "permission denied": use the connection string of the postgres user from Project Settings > Database.
  * A file failed halfway: each file is all-or-nothing, so fix the cause and run that file again, then the rest.
`

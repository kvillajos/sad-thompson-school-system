// Bulk student import (pure; tested by dev/scripts/checks/check-student-import.mjs). Reads a CSV (or rows from
// an .xlsx sheet), maps the headers, and validates every row the same way bulk_import_students() (v59) does.

export const IMPORT_COLUMNS = [
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'middle_name', label: 'Middle Name' },
  { key: 'birth_date', label: 'Birth Date', required: true, hint: 'YYYY-MM-DD or MM/DD/YYYY' },
  { key: 'sex', label: 'Sex', required: true, hint: 'Male or Female' },
  { key: 'grade_level', label: 'Grade Level', required: true, hint: '7 to 12' },
  { key: 'strand', label: 'Strand', hint: 'Grades 11-12 only, e.g. STEM' },
  { key: 'student_no', label: 'Student No', hint: 'Blank = generated' },
  { key: 'address', label: 'Address' },
  { key: 'contact_number', label: 'Contact Number' },
  { key: 'guardian_name', label: 'Guardian Name' },
  { key: 'guardian_relationship', label: 'Guardian Relationship' },
  { key: 'guardian_phone', label: 'Guardian Phone' },
  { key: 'guardian_email', label: 'Guardian Email' }
]
export const MAX_IMPORT_ROWS = 500

const ALIASES = {
  surname: 'last_name',
  'family name': 'last_name',
  'given name': 'first_name',
  'middle initial': 'middle_name',
  birthdate: 'birth_date',
  'date of birth': 'birth_date',
  dob: 'birth_date',
  gender: 'sex',
  grade: 'grade_level',
  'grade level': 'grade_level',
  'student id': 'student_no',
  'student number': 'student_no',
  lrn: 'student_no',
  'contact no': 'contact_number',
  'guardian contact': 'guardian_phone',
  'guardian phone number': 'guardian_phone',
  relationship: 'guardian_relationship'
}

export function headerKey(text) {
  const plain = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (ALIASES[plain]) return ALIASES[plain]
  const key = plain.replace(/ /g, '_')
  return IMPORT_COLUMNS.some(column => column.key === key) ? key : null
}

// RFC 4180: quoted cells may hold commas, quotes ("") and line breaks. Blank lines are dropped.
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const source = String(text ?? '').replace(/^﻿/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') ((cell += '"'), i++)
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') (row.push(cell), (cell = ''))
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      ;(row.push(cell), rows.push(row), (row = []), (cell = ''))
    } else cell += char
  }
  if (cell !== '' || row.length) (row.push(cell), rows.push(row))
  return rows.filter(cells => cells.some(value => String(value).trim() !== ''))
}

const pad = n => String(n).padStart(2, '0')
// 'YYYY-MM-DD', 'MM/DD/YYYY' or a Date (from an .xlsx cell) -> 'YYYY-MM-DD', or null when it is not a real date.
export function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  const text = String(value ?? '').trim()
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  let [y, m, d] = match ? [match[1], match[2], match[3]] : []
  if (!match && (match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text))) [m, d, y] = [match[1], match[2], match[3]]
  if (!match) return null
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d) ? `${y}-${pad(m)}-${pad(d)}` : null
}

const SEX = { m: 'Male', male: 'Male', f: 'Female', female: 'Female' }

// table: array of cell arrays, first row = headers. Returns { rows, unknownHeaders, missingHeaders }.
export function tableToRecords(table) {
  const [header = [], ...body] = table
  const keys = header.map(headerKey)
  const unknownHeaders = header
    .filter((_, i) => !keys[i])
    .map(String)
    .filter(Boolean)
  const missingHeaders = IMPORT_COLUMNS.filter(c => c.required && !keys.includes(c.key)).map(c => c.label)
  const rows = body.map((cells, index) => {
    const values = {}
    keys.forEach((key, i) => {
      if (!key) return
      const raw = cells[i]
      values[key] = raw instanceof Date ? raw : String(raw ?? '').trim()
    })
    return { row: index + 2, values }
  })
  return { rows, unknownHeaders, missingHeaders }
}

// context: { offeredGrades: number[], strands: string[], existingKeys: Set('last|first|YYYY-MM-DD'), existingNumbers: Set }
export function validateImportRows(rows, { offeredGrades = [], strands = [], existingKeys = new Set(), existingNumbers = new Set() } = {}) {
  const seen = new Map()
  const seenNumbers = new Map()
  return rows.map(({ row, values }) => {
    const errors = []
    const clean = {}
    for (const column of IMPORT_COLUMNS) {
      const value = values[column.key]
      clean[column.key] = value instanceof Date ? value : String(value ?? '').trim() || null
      if (column.required && !clean[column.key]) errors.push(`${column.label} is required`)
    }
    if (clean.birth_date) {
      const iso = isoDate(clean.birth_date)
      if (!iso) errors.push('Birth Date must be a real date (YYYY-MM-DD or MM/DD/YYYY)')
      clean.birth_date = iso
    }
    if (clean.sex) {
      const sex = SEX[clean.sex.toLowerCase()]
      if (!sex) errors.push('Sex must be Male or Female')
      clean.sex = sex || clean.sex
    }
    if (clean.grade_level) {
      const grade = Number(/\d+/.exec(clean.grade_level)?.[0])
      if (!offeredGrades.includes(grade)) errors.push(`Grade Level must be one the school offers (${offeredGrades.join(', ')})`)
      clean.grade_level = grade
    }
    const shs = clean.grade_level >= 11
    if (shs && !clean.strand) errors.push('Strand is required for Grades 11-12')
    if (clean.strand) {
      const strand = strands.find(code => code.toLowerCase() === clean.strand.toLowerCase())
      if (!shs) errors.push('Strand is only for Grades 11-12')
      else if (!strand) errors.push(`Strand must be one of ${strands.join(', ')}`)
      clean.strand = strand || clean.strand
    }
    if (clean.guardian_email && !/^\S+@\S+\.\S+$/.test(clean.guardian_email)) errors.push('Guardian Email is not valid')
    if (clean.guardian_phone && !/^\+?[0-9 ()-]{7,20}$/.test(clean.guardian_phone)) errors.push('Guardian Phone is not valid')
    for (const [key, max] of Object.entries({ first_name: 50, middle_name: 50, last_name: 50, address: 200, student_no: 30 }))
      if (clean[key] && clean[key].length > max)
        errors.push(`${IMPORT_COLUMNS.find(c => c.key === key).label} is longer than ${max} characters`)

    const key = [clean.last_name, clean.first_name, clean.birth_date].map(v => String(v ?? '').toLowerCase()).join('|')
    if (clean.last_name && clean.first_name && clean.birth_date) {
      if (existingKeys.has(key)) errors.push('A student with this name and birth date already exists (use Re-enroll instead)')
      if (seen.has(key)) errors.push(`Same student as row ${seen.get(key)}`)
      else seen.set(key, row)
    }
    if (clean.student_no) {
      if (existingNumbers.has(clean.student_no.toLowerCase())) errors.push('Student No is already used by another student')
      if (seenNumbers.has(clean.student_no.toLowerCase()))
        errors.push(`Student No repeats row ${seenNumbers.get(clean.student_no.toLowerCase())}`)
      else seenNumbers.set(clean.student_no.toLowerCase(), row)
    }
    return { row, values: clean, errors }
  })
}

export const importTemplateCsv = () =>
  [
    IMPORT_COLUMNS.map(c => c.label).join(','),
    'Dela Cruz,Juan,Santos,2013-04-15,Male,7,,,"123 Rizal St., Brgy. Uno, Quezon City",09171234567,Maria Dela Cruz,Mother,09181234567,maria@example.com'
  ].join('\r\n') + '\r\n'

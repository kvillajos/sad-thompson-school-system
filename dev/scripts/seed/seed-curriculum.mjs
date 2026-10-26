// Rebuilds the demo school on the K-12 catalog in curriculum.mjs: subjects, sections (2024-2025 to 2026-2027),
// students with logins, faculty with logins, this year's timetable, grades and daily attendance.
//
//   node --env-file=.env dev/scripts/seed/seed-curriculum.mjs sql <out.sql>   reads the live data (read-only) and
//        writes one transaction that wipes and reseeds; review it, then run it (supabase db query -f <out.sql>)
//   node --env-file=.env dev/scripts/seed/seed-curriculum.mjs auth            after the SQL ran: creates the
//        Supabase Auth login for every users row that has none (password = users.initial_password)
//
// Kept: admins, registrars, the 11 existing faculty and the 45 existing students (with their logins; they get a
// consistent 3-year history). Replaced: subjects, sections, enrollments, schedules, grades, attendance, school days,
// and the workflow rows that pointed at the old sections (approval/shift requests, promotion logs, notifications).
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { SUBJECTS, SECTION_LAYOUT, subjectsFor } from './curriculum.mjs'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (node --env-file=.env).')
const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

const YEARS = ['2024-2025', '2025-2026', '2026-2027']
const CURRENT = YEARS[YEARS.length - 1]
const ATTENDANCE_UNTIL = '2026-10-26' // last school day recorded for the current year
const CAPACITY = 40
const MIN_SIZE = 22 // "at least half full" (20 of 40), with a little margin
const MAX_SIZE = 34
const RETENTION = 0.95 // share of students who return the next year
const MAX_LOAD = 6 // classes per teacher per day
// One class per slot, Monday to Friday; break is 9:45-10:00 and lunch 11:00-12:00 (school_year_settings).
const SLOTS = [
  ['07:30', '08:30'],
  ['08:30', '09:30'],
  ['10:00', '11:00'],
  ['12:00', '13:00'],
  ['13:00', '14:00'],
  ['14:00', '15:00'],
  ['15:00', '16:00'],
  ['16:00', '17:00']
]
const FACULTY_AREA = {
  Mathematics: 'Mathematics',
  Science: 'Science',
  'Earth Science': 'Science',
  English: 'English',
  Filipino: 'Filipino',
  'Social Studies': 'Social Studies',
  'Physical Education': 'MAPEH',
  'Values Education': 'Values Education',
  'Information Technology': 'ICT',
  Research: 'Research'
}
const SHS_AREAS = new Set(['ICT', 'Research', 'Business', 'Technical'])

// Deterministic randomness, so the same run produces the same school.
let seed = 20261027
const random = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = list => list[Math.floor(random() * list.length)]
const between = (low, high) => low + Math.floor(random() * (high - low + 1))
const shuffle = list => {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const MALE =
  'Juan,Jose,Miguel,Gabriel,Rafael,Paolo,Carlo,Marco,Antonio,Luis,Andres,Lorenzo,Nathaniel,Joshua,Daniel,Christian,Mark,John,Kenneth,Ralph,Adrian,Bryan,Jerome,Vincent,Patrick,Emmanuel,Francis,Isaac,Elijah,Samuel,Matthew,Jacob,Ethan,Aaron,Benedict,Dominic,Gerald,Harold,Ivan,Jericho,Kevin,Lance,Neil,Oliver,Renz,Simon,Tristan,Vince,Xavier,Zachary'.split(
    ','
  )
const FEMALE =
  'Maria,Ana,Sofia,Isabella,Camila,Andrea,Bea,Clarisse,Danica,Ella,Faith,Grace,Hannah,Irish,Jasmine,Kate,Lea,Mae,Nicole,Patricia,Queenie,Rose,Sarah,Trisha,Ursula,Vanessa,Wendy,Ysabel,Zoe,Angela,Bianca,Carmela,Denise,Erika,Francine,Gwen,Hazel,Ivy,Joanna,Kristine,Lovely,Mika,Nina,Olivia,Pia,Rhea,Shaira,Tricia,Venice,Althea'.split(
    ','
  )
const SECOND = 'Mae,Joy,Grace,Anne,Marie,Rose,Faith,Hope,Jane,Claire'.split(',')
const SECOND_M = 'Paolo,Luis,Miguel,Jose,Carlos,Rey,James,Paul,Mark,Angelo'.split(',')
const SURNAMES =
  'Abad,Abella,Agustin,Alcantara,Alonzo,Aquino,Arellano,Bautista,Belmonte,Bernardo,Buenaventura,Cabrera,Calderon,Camacho,Castillo,Castro,Cervantes,Cruz,Dantes,David,De Guzman,De Leon,Del Rosario,Delos Santos,Diaz,Dizon,Domingo,Enriquez,Escobar,Espinosa,Estrada,Fajardo,Feliciano,Fernandez,Flores,Francisco,Galang,Garcia,Gomez,Gonzales,Guevarra,Gutierrez,Hernandez,Ignacio,Jimenez,Lacson,Lagman,Laurel,Lim,Lopez,Lucero,Macaraeg,Magbanua,Malonzo,Manalo,Marquez,Medina,Mendoza,Mercado,Miranda,Morales,Natividad,Navarro,Ocampo,Ong,Ortega,Padilla,Pascual,Perez,Quiambao,Ramos,Reyes,Rivera,Robles,Rodriguez,Rosales,Salazar,Salvador,Samonte,Santiago,Santos,Sarmiento,Sison,Soriano,Tan,Tolentino,Torres,Valdez,Valenzuela,Vergara,Villanueva,Yap,Zamora'.split(
    ','
  )

const sql = value => (value == null ? 'null' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`)
const sqlArray = (list, type) => (list ? `array[${list.map(item => sql(item)).join(',')}]::${type}[]` : 'null')
const values = rows => rows.map(row => `(${row.join(',')})`).join(',\n')

const usernameFor = (first, last) =>
  `${first
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')}${last.replace(/[^a-z]/gi, '')}`.toLowerCase()

async function readAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

// Every subject is linked to the teachers of its area (not only the ones timetabled now), so Auto-schedule can
// staff 2nd-semester subjects. faculty: [{ employee_no, area }].
function facultySubjectsSql(faculty) {
  const links = SUBJECTS.flatMap(subject => faculty.filter(t => t.area === subject.area).map(t => [sql(t.employee_no), sql(subject.code)]))
  return `insert into faculty_subjects (profile_id, subject_id)
select p.profile_id, s.subject_id from (values
${values(links)}
) v(employee_no, subject_code) join staff_profiles p on p.employee_no = v.employee_no join subjects s on s.subject_code = v.subject_code
on conflict (profile_id, subject_id) do nothing;`
}

async function buildSql(outFile) {
  const [existingStudents, users, staff] = await Promise.all([
    readAll('students', 'student_id,lrn_number,first_name,last_name,gender,grade_level,enrollment_status'),
    readAll('users', 'user_id,username,email,role_id'),
    readAll('staff_profiles', 'profile_id,employee_no,first_name,last_name,department,specialization,user_id')
  ])
  const takenUsernames = new Set(users.map(user => user.username.toLowerCase()))
  const takenNames = new Set([...existingStudents, ...staff].map(s => `${s.first_name} ${s.last_name}`.toLowerCase()))
  const uniqueUsername = (first, last) => {
    const base = usernameFor(first, last)
    let name = base
    for (let n = 2; takenUsernames.has(name); n += 1) name = `${base}${n}`
    takenUsernames.add(name)
    return name
  }
  const newPerson = gender => {
    for (;;) {
      const first =
        gender === 'Male'
          ? `${pick(MALE)}${random() < 0.4 ? ` ${pick(SECOND_M)}` : ''}`
          : `${pick(FEMALE)}${random() < 0.5 ? ` ${pick(SECOND)}` : ''}`
      const last = pick(SURNAMES)
      const key = `${first} ${last}`.toLowerCase()
      if (takenNames.has(key)) continue
      takenNames.add(key)
      return { first, last, middle: pick(SURNAMES) }
    }
  }

  // ---- Students: the existing 45 keep their place in the current year; history and the rest are generated.
  let lrnCounter = 20000
  const students = []
  const newStudent = (grade, yearIndex) => {
    const gender = random() < 0.5 ? 'Male' : 'Female'
    const person = newPerson(gender)
    const startYear = Number(YEARS[yearIndex].slice(0, 4))
    const birthYear = startYear - grade - 6
    const student = {
      key: `new-${(lrnCounter += 1)}`,
      lrn: `TCS-${String(startYear).slice(2)}-${lrnCounter}`,
      ...person,
      gender,
      dob: `${birthYear}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
      strand: null,
      history: [],
      status: 'Enrolled'
    }
    students.push(student)
    return student
  }
  const existing = existingStudents.map(s => ({
    key: `old-${s.student_id}`,
    id: s.student_id,
    lrn: s.lrn_number,
    first: s.first_name,
    last: s.last_name,
    gender: s.gender,
    currentGrade: Number(s.grade_level),
    strand: null,
    history: [],
    status: 'Enrolled'
  }))
  students.push(...existing)

  const sectionsByYear = YEARS.map(year =>
    SECTION_LAYOUT.map((layout, index) => ({
      ...layout,
      year,
      room: `Room ${layout.grade <= 10 ? 100 + index + 1 : 200 + index + 1}`,
      members: []
    }))
  )
  const place = (student, section, yearIndex) => {
    section.members.push(student)
    student.history.push({ year: YEARS[yearIndex], grade: section.grade, section })
    if (section.strand) student.strand = section.strand
  }
  const roomIn = section => section.members.length < CAPACITY

  YEARS.forEach((year, yearIndex) => {
    const sections = sectionsByYear[yearIndex]
    const previous = yearIndex ? sectionsByYear[yearIndex - 1] : []
    // 1. Existing students: their grade this year is their current grade minus the years still to come.
    existing.forEach(student => {
      const grade = student.currentGrade - (YEARS.length - 1 - yearIndex)
      if (grade < 7) return
      const options = sections.filter(section => section.grade === grade && (!student.strand || section.strand === student.strand))
      const section = options.sort((a, b) => a.members.length - b.members.length)[0]
      if (section) place(student, section, yearIndex)
    })
    // 2. Last year's students move up a grade (most of them return; Grade 12 graduates).
    previous.forEach(oldSection => {
      oldSection.members.forEach(student => {
        if (student.key.startsWith('old-') || student.status !== 'Enrolled') return
        if (oldSection.grade === 12) return (student.status = 'Graduated')
        if (random() > RETENTION) return (student.status = 'Transferred')
        const grade = oldSection.grade + 1
        const options = sections.filter(
          section => section.grade === grade && roomIn(section) && (!student.strand || section.strand === student.strand)
        )
        if (!options.length) return (student.status = 'Transferred')
        // Grade 10 students choosing a strand spread across the strands that still have room.
        const section = grade === 11 ? pick(options) : options.sort((a, b) => a.members.length - b.members.length)[0]
        place(student, section, yearIndex)
      })
    })
    // 3. New students (admissions and transferees) fill every section to a random size of at least half.
    sections.forEach(section => {
      const target = Math.max(section.members.length, between(MIN_SIZE, MAX_SIZE))
      while (section.members.length < Math.min(target, CAPACITY)) place(newStudent(section.grade, yearIndex), section, yearIndex)
    })
  })
  // A student who was not placed in the current year has left (graduated or transferred); the rest stay Enrolled.
  students.forEach(student => {
    const last = student.history[student.history.length - 1]
    if (student.status === 'Enrolled' && last?.year !== CURRENT) student.status = last?.grade === 12 ? 'Graduated' : 'Transferred'
    student.grade = last?.grade ?? student.currentGrade
  })
  const placed = students.filter(student => student.history.length)

  // ---- Faculty and the current year's timetable (1st semester for Senior High; Junior High is whole-year).
  const faculty = staff
    .filter(person => person.department !== 'Registrar Office')
    .map(person => ({
      ...person,
      name: `${person.first_name} ${person.last_name}`,
      area: FACULTY_AREA[person.specialization] || person.specialization,
      busy: new Set()
    }))
  let employeeCounter = Math.max(...staff.map(person => Number(String(person.employee_no).replace(/\D/g, '')) || 0))
  const newFaculty = []
  const hire = area => {
    const gender = random() < 0.55 ? 'Female' : 'Male'
    const person = newPerson(gender)
    const teacher = {
      employee_no: `FAC-${String((employeeCounter += 1)).padStart(3, '0')}`,
      first_name: person.first,
      last_name: person.last,
      department: SHS_AREAS.has(area) ? 'Senior High School' : 'Basic Education',
      specialization: area,
      area,
      name: `${person.first} ${person.last}`,
      busy: new Set(),
      username: uniqueUsername(person.first, person.last)
    }
    faculty.push(teacher)
    newFaculty.push(teacher)
    return teacher
  }
  const schedules = []
  const currentSections = sectionsByYear[YEARS.length - 1]
  currentSections.forEach(section => {
    const taken = new Set()
    const classes = subjectsFor(section.grade, section.strand ?? null).filter(subject => subject.semester !== 2)
    classes.forEach(subject => {
      const openSlots = shuffle(SLOTS.map((_, index) => index).filter(index => !taken.has(index)))
      const teachers = faculty.filter(t => t.area === subject.area && t.busy.size < MAX_LOAD).sort((a, b) => a.busy.size - b.busy.size)
      let choice = null
      for (const teacher of teachers) {
        const slot = openSlots.find(index => !teacher.busy.has(index))
        if (slot !== undefined) {
          choice = { teacher, slot }
          break
        }
      }
      choice ||= { teacher: hire(subject.area), slot: openSlots[0] }
      choice.teacher.busy.add(choice.slot)
      taken.add(choice.slot)
      schedules.push({ section, subject, teacher: choice.teacher, slot: choice.slot })
    })
  })
  // Each section's moderator (adviser) is one of its own teachers, never the moderator of two sections in a year.
  const moderators = new Set()
  currentSections.forEach(section => {
    const own = schedules.filter(row => row.section === section).map(row => row.teacher.name)
    const name = own.find(candidate => !moderators.has(candidate)) || faculty.map(t => t.name).find(candidate => !moderators.has(candidate))
    moderators.add(name)
    sectionsByYear.forEach(sections => (sections.find(s => s.name === section.name && s.grade === section.grade).moderator = name))
  })

  // ---- SQL
  const triggerTables = [
    'academic_history',
    'attendance',
    'enrollments',
    'sections',
    'students',
    'subjects',
    'subject_schedules',
    'faculty_subjects',
    'staff_profiles',
    'users',
    'student_school_years',
    'school_days',
    'school_year_settings',
    'promotion_logs',
    'approval_requests'
  ]
  const lines = []
  const add = text => lines.push(text)
  add(`-- Generated by dev/scripts/seed/seed-curriculum.mjs on ${new Date().toISOString()}. One transaction.`)
  add('begin;')
  add("set local statement_timeout = '15min';")
  add('-- Bulk seed: audit, snapshot, guard and sync triggers are off for these tables until the end of the transaction.')
  triggerTables.forEach(table => add(`alter table public.${table} disable trigger user;`))
  add(`delete from attendance; delete from academic_history; delete from subject_schedules; delete from faculty_subjects;
delete from student_school_years; delete from enrollments; delete from promotion_logs; delete from shift_requests;
delete from approval_requests; delete from notifications; delete from sections; delete from subjects; delete from school_days;`)

  add(`insert into subjects (subject_code, title, subject_name, units, grade_level, description, is_active, subject_type, semester, strands) values
${values(
  SUBJECTS.map(s => [
    sql(s.code),
    sql(s.name),
    sql(s.name),
    3,
    sqlArray(s.grades, 'integer'),
    sql(s.grades[0] <= 10 ? `Grade ${s.grades[0]} ${s.area}` : `${s.type} subject${s.strands ? ` (${s.strands.join(', ')})` : ''}`),
    'true',
    sql(s.type),
    s.semester ?? 'null',
    sqlArray(s.strands, 'text')
  ])
)};`)

  if (newFaculty.length) {
    add(`insert into users (username, email, password_hash, role_id, is_active, initial_password) values
${values(newFaculty.map(t => [sql(t.username), sql(`${t.username}@tcs.edu.ph`), `extensions.crypt(${sql(`${t.username}123`)}, extensions.gen_salt('bf'))`, 3, 'true', sql(`${t.username}123`)]))};`)
    add(`insert into staff_profiles (user_id, employee_no, first_name, last_name, department, specialization)
select u.user_id, v.employee_no, v.first_name, v.last_name, v.department, v.specialization
from (values
${values(newFaculty.map(t => [sql(t.username), sql(t.employee_no), sql(t.first_name), sql(t.last_name), sql(t.department), sql(t.specialization)]))}
) v(username, employee_no, first_name, last_name, department, specialization) join users u on u.username = v.username;`)
  }

  // Students: existing rows are updated, new rows inserted with a login each.
  add(`update students s set grade_level = v.grade, strand = v.strand, enrollment_status = v.status
from (values
${values(existing.map(s => [s.id, s.grade, sql(s.strand), sql(s.status)]))}
) v(id, grade, strand, status) where s.student_id = v.id;`)
  const created = students.filter(s => !s.id)
  created.forEach(s => (s.username = uniqueUsername(s.first, s.last)))
  const relations = ['Mother', 'Father', 'Mother', 'Guardian']
  add(`insert into students (lrn_number, first_name, middle_name, last_name, date_of_birth, gender, grade_level, strand, enrollment_status, guardian_name, guardian_relationship, guardian_phone, guardian_email) values
${values(
  created.map(s => {
    const relationship = pick(relations)
    const guardianFirst = relationship === 'Father' ? pick(MALE) : pick(FEMALE)
    return [
      sql(s.lrn),
      sql(s.first),
      sql(s.middle),
      sql(s.last),
      sql(s.dob),
      sql(s.gender),
      s.grade,
      sql(s.strand),
      sql(s.status),
      sql(`${guardianFirst} ${s.last}`),
      sql(relationship),
      sql(`09${between(10, 99)}${between(1000000, 9999999)}`),
      sql(`${guardianFirst.toLowerCase()}.${s.last.replace(/[^a-z]/gi, '').toLowerCase()}${between(1, 99)}@gmail.com`)
    ]
  })
)};`)
  add(`insert into users (username, email, password_hash, role_id, is_active, initial_password, student_id)
select v.username, v.username || '@tcs.edu.ph', extensions.crypt(v.username || '123', extensions.gen_salt('bf', 4)), 4, true, v.username || '123', s.student_id
from (values
${values(created.map(s => [sql(s.username), sql(s.lrn)]))}
) v(username, lrn) join students s on s.lrn_number = v.lrn;
update students s set user_id = u.user_id from users u where u.student_id = s.student_id and s.user_id is null;`)

  // Sections for every year, then each student's enrollment and school-year row.
  add(`insert into sections (section_name, grade_level, strand, academic_year, capacity, min_capacity, status, room, semester, faculty_assigned) values
${values(
  sectionsByYear
    .flat()
    .map(s => [
      sql(s.name),
      s.grade,
      sql(s.strand ?? null),
      sql(s.year),
      CAPACITY,
      10,
      sql(s.year === CURRENT ? 'active' : 'closed'),
      sql(s.room),
      sql('1st Semester'),
      sql(s.moderator)
    ])
)};`)
  add(`create temp table seed_enrollment on commit drop as
select st.student_id, v.school_year, v.grade, sec.section_id, sec.strand, v.enrolled_at::timestamptz enrolled_at
from (values
${values(
  placed.flatMap(student =>
    student.history.map(entry => [
      sql(student.lrn),
      sql(entry.year),
      entry.grade,
      sql(entry.section.name),
      sql(`${entry.year.slice(0, 4)}-06-${String(between(1, 12)).padStart(2, '0')}`)
    ])
  )
)}
) v(lrn, school_year, grade, section_name, enrolled_at)
join students st on st.lrn_number = v.lrn
join sections sec on sec.section_name = v.section_name and sec.grade_level = v.grade and sec.academic_year = v.school_year;
insert into enrollments (student_id, school_year, grade_level, section_id, status, enrolled_at)
select student_id, school_year, grade, section_id, case when school_year = ${sql(CURRENT)} then 'active' else 'completed' end, enrolled_at from seed_enrollment;
insert into student_school_years (student_id, school_year, grade_level, section_id)
select student_id, school_year, grade, section_id from seed_enrollment;`)

  // This year's timetable and the subjects each teacher handles.
  add(`insert into subject_schedules (subject_id, section_id, faculty_name, faculty_profile_id, room, day_of_week, start_time, end_time)
select sub.subject_id, sec.section_id, p.first_name || ' ' || p.last_name, p.profile_id, sec.room, d.day, v.start_time::time, v.end_time::time
from (values
${values(schedules.map(row => [sql(row.section.name), row.section.grade, sql(row.subject.code), sql(row.teacher.employee_no), sql(SLOTS[row.slot][0]), sql(SLOTS[row.slot][1])]))}
) v(section_name, grade, subject_code, employee_no, start_time, end_time)
join sections sec on sec.section_name = v.section_name and sec.grade_level = v.grade and sec.academic_year = ${sql(CURRENT)}
join subjects sub on sub.subject_code = v.subject_code
join staff_profiles p on p.employee_no = v.employee_no
cross join generate_series(1, 5) d(day);
insert into faculty_subjects (profile_id, subject_id)
select distinct faculty_profile_id, subject_id from subject_schedules;`)
  add(facultySubjectsSql(faculty))

  // School days: every weekday from June to March (attendance below uses the same days).
  add(`create temp table seed_days on commit drop as
select sy.label school_year, d::date school_day
from school_years sy cross join generate_series(sy.start_date, sy.end_date, interval '1 day') d
where sy.label in (${YEARS.map(sql).join(',')}) and extract(isodow from d) <= 5 and extract(month from d) not in (4, 5);
insert into school_days (school_year, month, days, updated_by)
select school_year, extract(month from school_day)::int, count(*), 'seed' from seed_days group by 1, 2;
insert into school_year_settings (school_year, lunch_start, lunch_end, break_start, break_end, updated_by)
select y, '11:00', '12:00', '09:45', '10:00', 'seed' from unnest(array[${YEARS.map(sql).join(',')}]) y
on conflict (school_year) do nothing;`)

  // Grades: each student has an ability; each subject and quarter varies around it. Past years are complete and
  // locked; the current year has Q1 only (1st-semester subjects), unlocked, so faculty can continue the year.
  add(`create temp table seed_ability on commit drop as
select student_id, least(96, greatest(70, 85 + 5.5 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random()))) ability,
  0.005 + random() * 0.04 absent_rate, random() * 0.06 late_rate
from (select distinct student_id from seed_enrollment) s;
insert into academic_history (student_id, school_year, subject, first_sem_q1, first_sem_q2, second_sem_q1, second_sem_q2, grade, letter_grade, locked)
select student_id, school_year, subject_name, q1, q2, q3, q4, grade,
  (select b->>'letter' from grading_scales gs, jsonb_array_elements(gs.bands) b
    where gs.school_year = g.school_year and g.grade >= (b->>'min')::numeric order by (b->>'min')::numeric desc limit 1),
  not cur
from (
  select *, round((coalesce(q1, 0) + coalesce(q2, 0) + coalesce(q3, 0) + coalesce(q4, 0)) / num_nonnulls(q1, q2, q3, q4)) grade
  from (
    select student_id, school_year, subject_name, cur,
      case when semester is distinct from 2 then least(99, greatest(60, round(base + random() * 6 - 3))) end q1,
      case when semester is distinct from 2 and not cur then least(99, greatest(60, round(base + random() * 6 - 3))) end q2,
      case when semester is distinct from 1 and not cur then least(99, greatest(60, round(base + random() * 6 - 3))) end q3,
      case when semester is distinct from 1 and not cur then least(99, greatest(60, round(base + random() * 6 - 3))) end q4
    from (
      select e.student_id, e.school_year, s.subject_name, s.semester, e.school_year = ${sql(CURRENT)} cur, a.ability + random() * 8 - 4 base
      from seed_enrollment e
      join seed_ability a using (student_id)
      join subjects s on e.grade = any (s.grade_level) and (s.strands is null or e.strand = any (s.strands))
      where not (e.school_year = ${sql(CURRENT)} and s.semester = 2)
    ) x
  ) y
) g;`)

  // Attendance: one row per student per school day (to ${ATTENDANCE_UNTIL} in the current year).
  add(`insert into attendance (student_id, attendance_date, section_id, status)
select student_id, school_day, section_id,
  case when r < absent_rate then 'Absent' when r < absent_rate + 0.004 then 'Excused' when r < absent_rate + 0.004 + late_rate then 'Late' else 'Present' end
from (
  select e.student_id, d.school_day, e.section_id, a.absent_rate, a.late_rate, random() r
  from seed_enrollment e join seed_ability a using (student_id) join seed_days d on d.school_year = e.school_year
  where d.school_day <= ${sql(ATTENDANCE_UNTIL)}::date
) x;`)

  triggerTables.forEach(table => add(`alter table public.${table} enable trigger user;`))
  add(`select (select count(*) from subjects) subjects, (select count(*) from sections) sections,
  (select count(*) from students) students, (select count(*) from users where role_id = 3) faculty_logins,
  (select count(*) from users where role_id = 4) student_logins, (select count(*) from enrollments) enrollments,
  (select count(*) from subject_schedules) schedules, (select count(*) from academic_history) grades,
  (select count(*) from attendance) attendance;`)
  add('commit;')
  writeFileSync(outFile, lines.join('\n') + '\n')

  // Summary for review.
  const count = (list, fn) => list.filter(fn).length
  console.log(`SQL written to ${outFile}`)
  console.log(`Subjects ${SUBJECTS.length}; sections ${sectionsByYear.flat().length} (${SECTION_LAYOUT.length} per year)`)
  YEARS.forEach((year, index) => {
    const sizes = sectionsByYear[index].map(s => s.members.length)
    console.log(`${year}: ${sizes.reduce((a, b) => a + b, 0)} students, sections ${Math.min(...sizes)}-${Math.max(...sizes)}`)
  })
  console.log(
    `Students ${students.length} (existing ${existing.length}, new ${created.length}): Enrolled ${count(students, s => s.status === 'Enrolled')}, Graduated ${count(students, s => s.status === 'Graduated')}, Transferred ${count(students, s => s.status === 'Transferred')}`
  )
  console.log(
    `Faculty ${faculty.length} (existing ${faculty.length - newFaculty.length}, new ${newFaculty.length}); classes ${schedules.length}, schedule rows ${schedules.length * 5}`
  )
  const loads = faculty.map(t => t.busy.size)
  console.log(`Teacher load per day: ${Math.min(...loads)}-${Math.max(...loads)} classes`)
  console.log(
    'Sample new logins (password = username + 123):',
    created
      .slice(0, 2)
      .map(s => s.username)
      .concat(newFaculty.slice(0, 1).map(t => t.username))
      .join(', ')
  )
}

async function createAuthLogins() {
  const authEmails = new Set()
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    data.users.forEach(user => authEmails.add(user.email?.toLowerCase()))
    if (data.users.length < 200) break
  }
  const pending = (await readAll('users', 'user_id,username,email,role_id,initial_password')).filter(user => user.initial_password)
  const users = pending.filter(user => !authEmails.has(user.email.toLowerCase()))
  console.log(`${users.length} users rows have no Auth login yet.`)
  let done = 0
  for (const user of users) {
    const role = { 3: 'faculty', 4: 'student' }[user.role_id] || 'staff'
    const { error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.initial_password,
      email_confirm: true,
      user_metadata: { username: user.username, role }
    })
    if (error) throw new Error(`${user.username}: ${error.message}`)
    if (++done % 50 === 0) console.log(`${done} / ${users.length}`)
  }
  console.log(`Created ${done} Auth logins.`)
  // Same as the provision-account function: once the login exists, the stored starting password is cleared
  // (otherwise Manage Accounts keeps offering "Provision Login" and the password stays readable).
  const provisioned = pending.map(user => user.user_id)
  for (let index = 0; index < provisioned.length; index += 500) {
    const { error } = await supabase
      .from('users')
      .update({ initial_password: null })
      .in('user_id', provisioned.slice(index, index + 500))
    if (error) throw error
  }
  console.log(`Cleared the starting password on ${provisioned.length} provisioned accounts.`)
}

// Only the subject links (faculty_subjects) for the current staff, e.g. after adding subjects or teachers.
async function buildLinksSql(outFile) {
  const staff = await readAll('staff_profiles', 'employee_no,department,specialization')
  const faculty = staff
    .filter(person => person.department !== 'Registrar Office')
    .map(person => ({ employee_no: person.employee_no, area: FACULTY_AREA[person.specialization] || person.specialization }))
  writeFileSync(outFile, `begin;\n${facultySubjectsSql(faculty)}\nselect count(*) links from faculty_subjects;\ncommit;\n`)
  console.log(`Links SQL written to ${outFile}`)
}

const [mode, outFile] = process.argv.slice(2)
if (mode === 'sql' && outFile) await buildSql(outFile)
else if (mode === 'links' && outFile) await buildLinksSql(outFile)
else if (mode === 'auth') await createAuthLogins()
else console.log('Usage: seed-curriculum.mjs sql <out.sql> | links <out.sql> | auth')

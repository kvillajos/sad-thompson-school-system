// TCSMS subject catalog (K-12, old Senior High strands), from the partner school's subject list (2026-10-27).
// Junior High subjects are named by topic, one per grade; Senior High subjects carry a type, a semester and,
// for specialized subjects, the strands that take them. `area` is used only by the seed to pick a teacher.
// Pure data: used by seed-curriculum.mjs and printable for review with `node dev/scripts/seed/curriculum.mjs`.

const jhs = (grade, rows) =>
  rows.map(([code, name, area]) => ({ code: `${code}${grade}`, name, grades: [grade], type: 'Core', semester: null, strands: null, area }))

export const JUNIOR_HIGH = [
  ...jhs(7, [
    ['SCI', 'General Science / Earth Science', 'Science'],
    ['MATH', 'Pre-Algebra & Geometry', 'Mathematics'],
    ['ENG', 'Philippine Literature', 'English'],
    ['FIL', 'Panitikang Rehiyonal (Ibong Adarna)', 'Filipino'],
    ['AP', 'Philippine History & Geography', 'Social Studies'],
    ['VE', 'Christian Character / GMRC', 'Values Education'],
    ['MAPEH', 'MAPEH 7', 'MAPEH'],
    ['TLE', 'Exploratory Handy Crafts / ICT', 'TLE']
  ]),
  ...jhs(8, [
    ['SCI', 'Biological Sciences', 'Science'],
    ['MATH', 'Linear Equations & Rational Expressions', 'Mathematics'],
    ['ENG', 'Afro-Asian Literature', 'English'],
    ['FIL', 'Panitikang Pambansa (Florante at Laura)', 'Filipino'],
    ['AP', 'Asian Studies', 'Social Studies'],
    ['VE', 'Interpersonal Relationships', 'Values Education'],
    ['MAPEH', 'MAPEH 8', 'MAPEH'],
    ['TLE', 'Specialized Home Economics', 'TLE']
  ]),
  ...jhs(9, [
    ['SCI', 'Chemistry', 'Science'],
    ['MATH', 'Quadratic Equations & Trigonometry', 'Mathematics'],
    ['ENG', 'Anglo-American Literature', 'English'],
    ['FIL', 'Panitikang Asyano (Noli Me Tángere)', 'Filipino'],
    ['AP', 'World History', 'Social Studies'],
    ['VE', 'Social Responsibility', 'Values Education'],
    ['MAPEH', 'MAPEH 9', 'MAPEH'],
    ['TLE', 'Agri-Fishery / Tech-Voc Arts', 'TLE']
  ]),
  ...jhs(10, [
    ['SCI', 'Physics', 'Science'],
    ['MATH', 'Statistics & Probability', 'Mathematics'],
    ['ENG', 'World Literature', 'English'],
    ['FIL', 'Panitikang Pandaigdig (El Filibusterismo)', 'Filipino'],
    ['AP', 'Contemporary Issues', 'Social Studies'],
    ['VE', 'Leadership & Life Decisions', 'Values Education'],
    ['MAPEH', 'MAPEH 10', 'MAPEH'],
    ['TLE', 'Entrepreneurship & Pre-TVL', 'TLE']
  ])
]

// [code, name, type, grade, semester, strands, area]
const shs = rows =>
  rows.map(([code, name, type, grade, semester, strands, area]) => ({ code, name, grades: [grade], type, semester, strands, area }))

export const SENIOR_HIGH = shs([
  // Grade 11 core, applied and school subjects (every strand); split 5 / 5 across the semesters.
  ['OC', 'Oral Communication in Context', 'Core', 11, 1, null, 'English'],
  ['KOMPAN', 'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino', 'Core', 11, 1, null, 'Filipino'],
  ['GENMATH', 'General Mathematics', 'Core', 11, 1, null, 'Mathematics'],
  ['ELS', 'Earth and Life Science', 'Core', 11, 1, null, 'Science'],
  ['ETECH', 'Empowerment Technologies', 'Applied', 11, 1, null, 'ICT'],
  ['RWS', 'Reading and Writing Skills', 'Core', 11, 2, null, 'English'],
  ['STATPROB', 'Statistics and Probability', 'Core', 11, 2, null, 'Mathematics'],
  ['PERDEV', 'Personal Development', 'Core', 11, 2, null, 'Social Studies'],
  ['CHRETH', 'Christian Ethics', 'School', 11, 2, null, 'Values Education'],
  ['EAPP', 'English for Academic and Professional Purposes', 'Applied', 11, 2, null, 'English'],
  // Grade 12 core and applied (every strand); split 6 / 6.
  ['LIT21', '21st Century Literature from the Philippines and the World', 'Core', 12, 1, null, 'English'],
  ['MIL', 'Media and Information Literacy', 'Core', 12, 1, null, 'ICT'],
  ['PHYSCI', 'Physical Science', 'Core', 12, 1, null, 'Science'],
  ['UCSP', 'Understanding Culture, Society, and Politics', 'Core', 12, 1, null, 'Social Studies'],
  ['PR1', 'Practical Research 1', 'Applied', 12, 1, null, 'Research'],
  ['ENTREP', 'Entrepreneurship', 'Applied', 12, 1, null, 'Business'],
  ['PAGBASA', "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", 'Core', 12, 2, null, 'Filipino'],
  ['CPAR', 'Contemporary Philippine Arts from the Regions', 'Core', 12, 2, null, 'MAPEH'],
  ['PHILO', 'Introduction to the Philosophy of the Human Person', 'Core', 12, 2, null, 'Social Studies'],
  ['PR2', 'Practical Research 2', 'Applied', 12, 2, null, 'Research'],
  ['FILPL', 'Pagsulat sa Filipino sa Piling Larang', 'Applied', 12, 2, null, 'Filipino'],
  ['INQUIRY', 'Inquiries, Investigations, and Immersion', 'Applied', 12, 2, null, 'Research'],
  // STEM
  ['PRECAL', 'Pre-Calculus', 'Specialized', 11, 1, ['STEM'], 'Mathematics'],
  ['GENBIO1', 'General Biology 1', 'Specialized', 11, 1, ['STEM'], 'Science'],
  ['GENPHYS1', 'General Physics 1', 'Specialized', 11, 2, ['STEM'], 'Science'],
  ['GENCHEM1', 'General Chemistry 1', 'Specialized', 11, 2, ['STEM'], 'Science'],
  ['BASCAL', 'Basic Calculus', 'Specialized', 12, 1, ['STEM'], 'Mathematics'],
  ['GENBIO2', 'General Biology 2', 'Specialized', 12, 1, ['STEM'], 'Science'],
  ['GENPHYS2', 'General Physics 2', 'Specialized', 12, 2, ['STEM'], 'Science'],
  ['GENCHEM2', 'General Chemistry 2', 'Specialized', 12, 2, ['STEM'], 'Science'],
  // ABM (Organization and Management is shared with GAS)
  ['FABM1', 'Fundamentals of Accountancy, Business and Management 1', 'Specialized', 11, 1, ['ABM'], 'Business'],
  ['BUSMATH', 'Business Mathematics', 'Specialized', 11, 1, ['ABM'], 'Mathematics'],
  ['ORGMAN', 'Organization and Management', 'Specialized', 11, 2, ['ABM', 'GAS'], 'Business'],
  ['APPECON', 'Applied Economics', 'Specialized', 11, 2, ['ABM'], 'Business'],
  ['FABM2', 'Fundamentals of Accountancy, Business and Management 2', 'Specialized', 12, 1, ['ABM'], 'Business'],
  ['BUSFIN', 'Business Finance', 'Specialized', 12, 1, ['ABM'], 'Business'],
  ['BESR', 'Business Ethics and Social Responsibility', 'Specialized', 12, 2, ['ABM'], 'Business'],
  // HUMSS (all shared with GAS)
  ['DISS', 'Disciplines and Ideas in the Social Sciences', 'Specialized', 11, 1, ['HUMSS', 'GAS'], 'Social Studies'],
  ['CW', 'Creative Writing', 'Specialized', 11, 1, ['HUMSS', 'GAS'], 'English'],
  ['IWRBS', 'Introduction to World Religions and Belief Systems', 'Specialized', 11, 2, ['HUMSS', 'GAS'], 'Values Education'],
  ['DIASS', 'Disciplines and Ideas in the Applied Social Sciences', 'Specialized', 12, 1, ['HUMSS', 'GAS'], 'Social Studies'],
  ['CNF', 'Creative Nonfiction', 'Specialized', 12, 1, ['HUMSS'], 'English'],
  ['PPG', 'Philippine Politics and Governance', 'Specialized', 12, 2, ['HUMSS', 'GAS'], 'Social Studies'],
  // TVL - Computer System Servicing NC II
  ['CSSASM', 'Computer Systems Assembly', 'Specialized', 11, 1, ['TVL-CSS'], 'ICT'],
  ['CSSNET', 'Network Configuration', 'Specialized', 11, 2, ['TVL-CSS'], 'ICT'],
  ['CSSRTR', 'Router Setup & Diagnostics', 'Specialized', 12, 1, ['TVL-CSS'], 'ICT'],
  ['CSSMNT', 'System Maintenance', 'Specialized', 12, 2, ['TVL-CSS'], 'ICT'],
  // TVL - Motorcycle/Small Engine Servicing NC II
  ['MSEENG', 'Engine Overhauling', 'Specialized', 11, 1, ['TVL-MSES'], 'Technical'],
  ['MSEELEC', 'Electrical System Diagnostics', 'Specialized', 11, 2, ['TVL-MSES'], 'Technical'],
  ['MSECHS', 'Chassis Servicing', 'Specialized', 12, 1, ['TVL-MSES'], 'Technical'],
  // TVL - Plumbing NC I
  ['PLBPIPE', 'Piping Layouts', 'Specialized', 11, 1, ['TVL-PLUMB'], 'Technical'],
  ['PLBFIX', 'Fixture Installation', 'Specialized', 11, 2, ['TVL-PLUMB'], 'Technical'],
  ['PLBTEST', 'System Testing', 'Specialized', 12, 1, ['TVL-PLUMB'], 'Technical']
])

export const SUBJECTS = [...JUNIOR_HIGH, ...SENIOR_HIGH]

// The subjects a section of this grade (and strand, for Senior High) takes.
export const subjectsFor = (grade, strand = null) =>
  SUBJECTS.filter(subject => subject.grades.includes(grade) && (!subject.strands || subject.strands.includes(strand)))

// Sections per school year: Junior High keeps the school's existing sections; Senior High has one per strand.
export const SECTION_LAYOUT = [
  { grade: 7, name: 'Mapayapa' },
  { grade: 8, name: 'Malasakit' },
  { grade: 9, name: 'Masipag' },
  { grade: 10, name: 'Mapagmahal' },
  { grade: 10, name: 'Matapang' },
  { grade: 10, name: 'Malaya' },
  { grade: 11, name: 'Matalino', strand: 'STEM' },
  { grade: 11, name: 'Masigasig', strand: 'ABM' },
  { grade: 11, name: 'Makatao', strand: 'HUMSS' },
  { grade: 11, name: 'Malikhain', strand: 'GAS' },
  { grade: 11, name: 'Mahusay', strand: 'TVL-CSS' },
  { grade: 11, name: 'Masikap', strand: 'TVL-MSES' },
  { grade: 11, name: 'Matiyaga', strand: 'TVL-PLUMB' },
  { grade: 12, name: 'Matatag', strand: 'STEM' },
  { grade: 12, name: 'Maaasahan', strand: 'ABM' },
  { grade: 12, name: 'Mapagbigay', strand: 'HUMSS' },
  { grade: 12, name: 'Magalang', strand: 'GAS' },
  { grade: 12, name: 'Masinop', strand: 'TVL-CSS' },
  { grade: 12, name: 'Matulungin', strand: 'TVL-MSES' },
  { grade: 12, name: 'Mapanuri', strand: 'TVL-PLUMB' }
]

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  for (const { grade, name, strand } of SECTION_LAYOUT) {
    const list = subjectsFor(grade, strand ?? null)
    const bySem = sem => list.filter(s => (s.semester ?? 0) === sem).map(s => s.name)
    console.log(`\nGrade ${grade}${strand ? ` ${strand}` : ''} (${name}): ${list.length} subjects`)
    if (grade <= 10) console.log('  Whole year: ' + bySem(0).join(' | '))
    else [1, 2].forEach(sem => console.log(`  Sem ${sem} (${bySem(sem).length}): ` + bySem(sem).join(' | ')))
  }
  console.log(`\nTotal subjects: ${SUBJECTS.length}`)
}

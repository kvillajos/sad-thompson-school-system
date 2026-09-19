// Sectioning helpers: which students may join a section, and the balanced,
// randomized allocator behind "Auto-Assign Grades 1-10".
// Pure on purpose (no app imports) so scripts/check-sectioning.mjs can assert it in Node.

export const AUTO_ASSIGN_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const defaultRandom = () => Math.random()

export function shuffle(items, random = defaultRandom) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1))
    const held = copy[index]
    copy[index] = copy[swapWith]
    copy[swapWith] = held
  }
  return copy
}

const genderOf = student => String(student.gender || student.sex || '').trim().toLowerCase().charAt(0)

export function splitByGender(students) {
  return {
    boys: students.filter(student => genderOf(student) === 'm'),
    girls: students.filter(student => genderOf(student) === 'f'),
    others: students.filter(student => !'mf'.includes(genderOf(student)))
  }
}

// Students that may be placed into one section: exactly that grade level, and not
// already sitting in that same section.
export function studentsForSection(students, { gradeLevel, sectionId, enrolledByStudent = new Map() }) {
  return students.filter(student => Number(student.grade_level) === Number(gradeLevel)
    && Number(enrolledByStudent.get(student.student_id)) !== Number(sectionId))
}

// Deals shuffled boys and girls into the grade's sections one boy + one girl per
// section per round, so no section drifts far from an even split. Randomized order
// comes from the shuffle; capacity is never exceeded; leftovers are reported.
// grades limits the run to the chosen grade levels (see AUTO_ASSIGN_GRADES) and
// excludedStudentIds is the registrar do-not-move list.
export function planBalancedAssignments({ students, sections, enrolledByStudent = new Map(), random = defaultRandom, grades = AUTO_ASSIGN_GRADES, excludedStudentIds = new Set() }) {
  const assignments = []
  const summary = []
  const unplaced = []
  const inScope = new Set(grades.map(Number))

  const byGrade = new Map()
  students.forEach(student => {
    const grade = Number(student.grade_level)
    if (!inScope.has(grade)) return
    if (enrolledByStudent.get(student.student_id)) return // already has a section
    if (excludedStudentIds.has(Number(student.student_id))) return // registrar excluded them
    if (!byGrade.has(grade)) byGrade.set(grade, [])
    byGrade.get(grade).push(student)
  })

  ;[...byGrade.keys()].sort((a, b) => a - b).forEach(grade => {
    const gradeSections = sections
      .filter(section => Number(section.grade_level) === grade)
      .sort((a, b) => String(a.section_name).localeCompare(String(b.section_name)))
      .map(section => ({ ...section, free: Math.max(0, Number(section.capacity || 0) - Number(section.enrolled || 0)) }))

    if (!gradeSections.length) {
      byGrade.get(grade).forEach(student => unplaced.push({ student_id: student.student_id, grade_level: grade, reason: 'No section exists for this grade level' }))
      return
    }

    const pools = splitByGender(shuffle(byGrade.get(grade), random))
    const tally = new Map(gradeSections.map(section => [section.section_id, { boys: 0, girls: 0, others: 0 }]))
    const passes = [['boys', pools.boys], ['girls', pools.girls], ['others', pools.others]]
    let progressed = true
    while (progressed) {
      progressed = false
      // One boy, then one girl, per section per round keeps each section within one of even.
      passes.forEach(([key, pool]) => {
        gradeSections.forEach(section => {
          if (!pool.length || section.free <= 0) return
          const student = pool.shift()
          assignments.push({ student_id: student.student_id, section_id: section.section_id })
          section.free -= 1
          tally.get(section.section_id)[key] += 1
          progressed = true
        })
      })
    }

    gradeSections.forEach(section => {
      const counts = tally.get(section.section_id)
      summary.push({
        section_id: section.section_id,
        section_name: section.section_name,
        grade_level: grade,
        boys: counts.boys,
        girls: counts.girls,
        total: counts.boys + counts.girls + counts.others
      })
    })

    ;[...pools.boys, ...pools.girls, ...pools.others].forEach(student => unplaced.push({ student_id: student.student_id, grade_level: grade, reason: 'Every section for this grade level is full' }))
  })

  return { assignments, summary, unplaced }
}

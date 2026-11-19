export const $ = id => document.getElementById(id)
export const state = {
  applications: [],
  drafts: [],
  sections: [],
  students: [],
  studentSections: new Map(),
  selectedApplication: null,
  enrolledByStudent: new Map(),
  enrolledSections: new Map(),
  autoAssignPlan: null,
  academicStudentId: null,
  user: null
}
